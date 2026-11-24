// Package accounts creates and deletes users across main.db and their per-user database files.
package accounts

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/newanki/server/internal/auth"
	"github.com/newanki/server/internal/db"
	"github.com/newanki/server/internal/db/maindb"
)

// ErrEmailTaken is returned when the email already belongs to a user.
var ErrEmailTaken = errors.New("email already in use")

// ValidationError describes one invalid input field.
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string { return e.Field + ": " + e.Message }

// Service owns user lifecycle operations.
type Service struct {
	DB    *sql.DB
	Q     *maindb.Queries
	Users *db.UserDBManager
	Log   *slog.Logger
}

// CreateParams describes a new user.
type CreateParams struct {
	Email              string
	Name               string
	Password           string
	Role               string // "admin" or "user"
	MustChangePassword bool
}

// NormalizeEmail trims and lower-cases an email address.
func NormalizeEmail(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

// ValidateEmail checks the address shape.
func ValidateEmail(email string) error {
	if len(email) > 254 {
		return &ValidationError{"email", "e-posta çok uzun"}
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email || !strings.Contains(email, "@") {
		return &ValidationError{"email", "geçerli bir e-posta adresi girin"}
	}
	return nil
}

// ValidateName checks a display name.
func ValidateName(name string) error {
	n := utf8.RuneCountInString(strings.TrimSpace(name))
	if n == 0 {
		return &ValidationError{"name", "ad boş olamaz"}
	}
	if n > 100 {
		return &ValidationError{"name", "ad en fazla 100 karakter olabilir"}
	}
	return nil
}

// ValidRole reports whether role is a known role.
func ValidRole(role string) bool { return role == "admin" || role == "user" }

// Create inserts the user as 'provisioning', creates their database file, then marks them active.
// If any step fails, the row and any created files are removed.
func (s *Service) Create(ctx context.Context, p CreateParams) (maindb.User, error) {
	p.Email = NormalizeEmail(p.Email)
	p.Name = strings.TrimSpace(p.Name)
	if p.Role == "" {
		p.Role = "user"
	}
	if err := ValidateEmail(p.Email); err != nil {
		return maindb.User{}, err
	}
	if err := ValidateName(p.Name); err != nil {
		return maindb.User{}, err
	}
	if !ValidRole(p.Role) {
		return maindb.User{}, &ValidationError{"role", "rol 'admin' veya 'user' olmalı"}
	}
	if err := auth.ValidatePassword(p.Password); err != nil {
		return maindb.User{}, &ValidationError{"password", err.Error()}
	}
	hash, err := auth.HashPassword(p.Password)
	if err != nil {
		return maindb.User{}, err
	}
	uid, err := uuid.NewV7()
	if err != nil {
		return maindb.User{}, err
	}
	now := time.Now().UnixMilli()
	u, err := s.Q.CreateUser(ctx, maindb.CreateUserParams{
		Uid:                uid.String(),
		Email:              p.Email,
		Name:               p.Name,
		PasswordHash:       hash,
		Role:               p.Role,
		MustChangePassword: boolInt(p.MustChangePassword),
		CreatedAt:          now,
		UpdatedAt:          now,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return maindb.User{}, ErrEmailTaken
		}
		return maindb.User{}, err
	}

	_, release, err := s.Users.Create(ctx, uid)
	if err != nil {
		s.rollback(u)
		return maindb.User{}, fmt.Errorf("create user database: %w", err)
	}
	release()

	if err := s.Q.SetUserStatus(ctx, maindb.SetUserStatusParams{Status: "active", UpdatedAt: now, ID: u.ID}); err != nil {
		s.rollback(u)
		return maindb.User{}, err
	}
	u.Status = "active"
	return u, nil
}

func (s *Service) rollback(u maindb.User) {
	ctx := context.Background()
	if err := s.Q.DeleteUser(ctx, u.ID); err != nil {
		s.Log.Error("rollback user row", "uid", u.Uid, "err", err)
	}
	if uid, err := uuid.Parse(u.Uid); err == nil {
		if err := s.Users.Delete(uid); err != nil {
			s.Log.Error("rollback user files", "uid", u.Uid, "err", err)
		}
	}
}

// Delete removes the user row (sessions cascade) and their database and media files.
func (s *Service) Delete(ctx context.Context, u maindb.User) error {
	uid, err := uuid.Parse(u.Uid)
	if err != nil {
		return err
	}
	if err := s.Q.DeleteUser(ctx, u.ID); err != nil {
		return err
	}
	return s.Users.Delete(uid)
}

// CleanupProvisioning removes users left half-created by a crash during Create.
func (s *Service) CleanupProvisioning(ctx context.Context) error {
	stuck, err := s.Q.ListProvisioningUsers(ctx)
	if err != nil {
		return err
	}
	for _, u := range stuck {
		s.Log.Warn("removing half-created user", "uid", u.Uid, "email", u.Email)
		if err := s.Delete(ctx, u); err != nil {
			return err
		}
	}
	return nil
}

// EnsureBootstrapAdmin creates the first admin if main.db has no users at all. It never touches an
// existing installation, so restarting the server cannot reset anyone's password.
func (s *Service) EnsureBootstrapAdmin(ctx context.Context, email, password string) (bool, error) {
	n, err := s.Q.CountUsers(ctx)
	if err != nil {
		return false, err
	}
	if n > 0 {
		return false, nil
	}
	u, err := s.Create(ctx, CreateParams{
		Email:              email,
		Name:               "Admin",
		Password:           password,
		Role:               "admin",
		MustChangePassword: false,
	})
	if err != nil {
		return false, fmt.Errorf("bootstrap admin: %w", err)
	}
	s.Log.Warn("Varsayılan admin oluşturuldu; varsayılan şifreyi kullanıyorsanız Ayarlar'dan değiştirin.", "email", u.Email)
	return true, nil
}

// SetPassword validates and stores a new password.
func (s *Service) SetPassword(ctx context.Context, userID int64, password string, mustChange bool) error {
	if err := auth.ValidatePassword(password); err != nil {
		return &ValidationError{"password", err.Error()}
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	return s.Q.SetUserPassword(ctx, maindb.SetUserPasswordParams{
		PasswordHash:       hash,
		MustChangePassword: boolInt(mustChange),
		UpdatedAt:          time.Now().UnixMilli(),
		ID:                 userID,
	})
}

func boolInt(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}
