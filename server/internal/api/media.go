package api

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/newanki/server/internal/db/userdb"
)

var allowedImage = map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true, "image/gif": true}

var allowedAudio = map[string]bool{
	"audio/webm": true, "audio/ogg": true, "audio/mp4": true, "audio/mpeg": true,
	"audio/wav": true, "audio/x-wav": true, "audio/aac": true, "audio/x-m4a": true,
}

func (s *Server) handleUploadMedia(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	maxBytes := s.appSettings().UploadMaxBytes
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes+64<<10)
	file, header, err := r.FormFile("file")
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			return errField("file", fmt.Sprintf("dosya en fazla %d MB olabilir", maxBytes>>20))
		}
		return errField("file", "dosya eksik")
	}
	defer file.Close()
	if header.Size > maxBytes {
		return errField("file", fmt.Sprintf("dosya en fazla %d MB olabilir", maxBytes>>20))
	}

	head := make([]byte, 512)
	n, _ := io.ReadFull(file, head)
	head = head[:n]
	sniffed := http.DetectContentType(head)
	declared := strings.ToLower(strings.TrimSpace(strings.Split(header.Header.Get("Content-Type"), ";")[0]))

	var kind, mime string
	switch {
	case allowedImage[sniffed]:
		kind, mime = "image", sniffed
	case allowedAudio[declared] && (strings.HasPrefix(sniffed, "audio/") || strings.HasPrefix(sniffed, "video/") ||
		sniffed == "application/octet-stream"):
		// Audio sniffing is unreliable (e.g. webm reports video/webm); accept the declared audio type.
		kind, mime = "audio", declared
	default:
		return errField("file", "desteklenmeyen dosya türü (PNG, JPG, WEBP, GIF veya ses)")
	}

	uid, err := uuid.NewV7()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(rc.udb.MediaDir, 0o750); err != nil {
		return err
	}
	path := filepath.Join(rc.udb.MediaDir, uid.String())
	out, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o640)
	if err != nil {
		return err
	}
	written, err := io.Copy(out, io.MultiReader(strings.NewReader(string(head)), file))
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(path)
		return err
	}
	m, err := rc.udb.Q.CreateMedia(r.Context(), userdb.CreateMediaParams{
		Uid: uid.String(), Kind: kind, Mime: mime, Size: written, CreatedAt: s.now().UnixMilli(),
	})
	if err != nil {
		os.Remove(path)
		return err
	}
	writeJSON(w, http.StatusCreated, mediaDTO(m))
	return nil
}

func mediaDTO(m userdb.Medium) MediaDTO {
	return MediaDTO{UID: m.Uid, Kind: m.Kind, Mime: m.Mime, Size: m.Size, URL: "/api/v1/media/" + m.Uid}
}

func (s *Server) handleGetMedia(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	uid, err := pathUID(r, "uid")
	if err != nil {
		return err
	}
	m, err := rc.udb.Q.GetMediaByUID(r.Context(), uid)
	if errors.Is(err, sql.ErrNoRows) {
		return errNotFound("medya")
	}
	if err != nil {
		return err
	}
	f, err := os.Open(filepath.Join(rc.udb.MediaDir, m.Uid))
	if errors.Is(err, os.ErrNotExist) {
		return errNotFound("medya")
	}
	if err != nil {
		return err
	}
	defer f.Close()
	w.Header().Set("Content-Type", m.Mime)
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	http.ServeContent(w, r, "", time.UnixMilli(m.CreatedAt), f)
	return nil
}

func (s *Server) handleExportSQLite(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	tmp, err := os.CreateTemp("", "newanki-export-*.db")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	tmp.Close()
	os.Remove(tmpPath) // VACUUM INTO requires the target not to exist
	defer os.Remove(tmpPath)

	if _, err := rc.udb.DB.ExecContext(r.Context(), "VACUUM INTO ?", tmpPath); err != nil {
		return err
	}
	f, err := os.Open(tmpPath)
	if err != nil {
		return err
	}
	defer f.Close()
	name := "newanki-" + s.now().Format("2006-01-02") + ".db"
	w.Header().Set("Content-Type", "application/vnd.sqlite3")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	w.Header().Set("Cache-Control", "no-store")
	http.ServeContent(w, r, name, s.now(), f)
	return nil
}
