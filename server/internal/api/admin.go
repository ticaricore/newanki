package api

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/newanki/server/internal/accounts"
	"github.com/newanki/server/internal/db/maindb"
)

func (s *Server) adminUserDTO(u maindb.User) AdminUserDTO {
	var size int64
	if uid, err := uuid.Parse(u.Uid); err == nil {
		size = s.users.Size(uid)
	}
	return AdminUserDTO{UserDTO: userDTO(u), DBBytes: size}
}

func (s *Server) handleAdminListUsers(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	users, err := s.mainQ.ListUsers(r.Context())
	if err != nil {
		return err
	}
	out := make([]AdminUserDTO, 0, len(users))
	for _, u := range users {
		out = append(out, s.adminUserDTO(u))
	}
	writeJSON(w, http.StatusOK, AdminUserListResponse{Users: out})
	return nil
}

func (s *Server) handleAdminCreateUser(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	var in AdminUserCreate
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	mustChange := true
	if in.MustChangePassword != nil {
		mustChange = *in.MustChangePassword
	}
	u, err := s.accounts.Create(r.Context(), accounts.CreateParams{
		Email: in.Email, Name: in.Name, Password: in.Password, Role: in.Role, MustChangePassword: mustChange,
	})
	if err != nil {
		return err
	}
	s.audit(r.Context(), s.mainQ, rc, "user.create", u.Uid, u.Email)
	writeJSON(w, http.StatusCreated, s.adminUserDTO(u))
	return nil
}

func (s *Server) adminTarget(r *http.Request) (maindb.User, error) {
	uid, err := pathUID(r, "uid")
	if err != nil {
		return maindb.User{}, err
	}
	u, err := s.mainQ.GetUserByUID(r.Context(), uid)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && u.Status == "provisioning") {
		return u, errNotFound("kullanıcı")
	}
	return u, err
}

func (s *Server) handleAdminPatchUser(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	var in AdminUserPatch
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	u, err := s.adminTarget(r)
	if err != nil {
		return err
	}
	self := u.ID == rc.user.ID
	name, role, status := u.Name, u.Role, u.Status
	if in.Name != nil {
		name = strings.TrimSpace(*in.Name)
		if err := accounts.ValidateName(name); err != nil {
			return err
		}
	}
	if in.Role != nil {
		if !accounts.ValidRole(*in.Role) {
			return errField("role", "rol 'admin' veya 'user' olmalı")
		}
		role = *in.Role
	}
	if in.Status != nil {
		if *in.Status != "active" && *in.Status != "disabled" {
			return errField("status", "durum 'active' veya 'disabled' olmalı")
		}
		status = *in.Status
	}
	if self && (role != "admin" || status != "active") {
		return errBadRequest("self_lockout", "kendi admin yetkinizi kaldıramaz veya hesabınızı devre dışı bırakamazsınız")
	}
	losingAdmin := u.Role == "admin" && u.Status == "active" && (role != "admin" || status != "active")
	if losingAdmin {
		n, err := s.mainQ.CountActiveAdmins(r.Context())
		if err != nil {
			return err
		}
		if n <= 1 {
			return errBadRequest("last_admin", "en az bir aktif admin kalmalı")
		}
	}

	if err := s.mainQ.UpdateUserProfile(r.Context(), maindb.UpdateUserProfileParams{
		Name: name, Role: role, Status: status, UpdatedAt: time.Now().UnixMilli(), ID: u.ID,
	}); err != nil {
		return err
	}
	if status == "disabled" && u.Status != "disabled" {
		if err := s.mainQ.DeleteUserSessions(r.Context(), u.ID); err != nil {
			return err
		}
	}
	if in.Password != nil {
		if err := s.accounts.SetPassword(r.Context(), u.ID, *in.Password, !self); err != nil {
			return err
		}
		if !self {
			if err := s.mainQ.DeleteUserSessions(r.Context(), u.ID); err != nil {
				return err
			}
		}
		s.audit(r.Context(), s.mainQ, rc, "user.password_reset", u.Uid, "")
	}
	s.audit(r.Context(), s.mainQ, rc, "user.update", u.Uid, "role="+role+" status="+status)

	u, err = s.mainQ.GetUserByID(r.Context(), u.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, s.adminUserDTO(u))
	return nil
}

func (s *Server) handleAdminDeleteUser(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	u, err := s.adminTarget(r)
	if err != nil {
		return err
	}
	if u.ID == rc.user.ID {
		return errBadRequest("self_delete", "kendi hesabınızı silemezsiniz")
	}
	if u.Role == "admin" && u.Status == "active" {
		n, err := s.mainQ.CountActiveAdmins(r.Context())
		if err != nil {
			return err
		}
		if n <= 1 {
			return errBadRequest("last_admin", "en az bir aktif admin kalmalı")
		}
	}
	if err := s.accounts.Delete(r.Context(), u); err != nil {
		return err
	}
	s.audit(r.Context(), s.mainQ, rc, "user.delete", u.Uid, u.Email)
	return noContent(w)
}

func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	users, err := s.mainQ.ListUsers(r.Context())
	if err != nil {
		return err
	}
	st := AdminStats{Users: len(users), OpenDatabases: s.users.OpenCount()}
	for _, u := range users {
		if u.Status == "active" {
			st.ActiveUsers++
		}
		if u.Role == "admin" {
			st.Admins++
		}
		if uid, err := uuid.Parse(u.Uid); err == nil {
			st.TotalDBBytes += s.users.Size(uid)
		}
	}
	st.AIConfigured = s.ai != nil
	st.AIModel = s.aiModel()
	usage, err := s.mainQ.AIUsageForDay(r.Context(), aiDay(s.now()))
	if err != nil {
		return err
	}
	st.AIRequests, st.AICards, st.AITokens = usage.Requests, usage.Cards, usage.InputTokens+usage.OutputTokens
	writeJSON(w, http.StatusOK, st)
	return nil
}
