// Package web serves the built single-page app embedded into the binary.
package web

import (
	"embed"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
)

// dist is populated by `make build` (copied from web/dist). It only holds .gitkeep in a fresh checkout.
//
//go:embed all:dist
var dist embed.FS

const csp = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; " +
	"style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; " +
	"manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

func init() {
	// Go does not know the PWA manifest extension.
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
}

// Handler serves static files and falls back to index.html for client-side routes.
func Handler() http.Handler {
	sub, _ := fs.Sub(dist, "dist")
	files := http.FileServer(http.FS(sub))
	_, err := fs.Stat(sub, "index.html")
	built := err == nil

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h := w.Header()
		h.Set("Content-Security-Policy", csp)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("X-Frame-Options", "DENY")

		if !built {
			h.Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("<!doctype html><p>NewAnki arayüzü derlenmemiş. <code>make build</code> çalıştırın " +
				"veya geliştirme için Vite sunucusunu (:5173) kullanın.</p>"))
			return
		}

		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p == "" {
			p = "index.html"
		}
		if fi, err := fs.Stat(sub, p); err != nil || fi.IsDir() {
			// Unknown path without an extension → SPA route; with an extension → real 404.
			if path.Ext(p) != "" {
				http.NotFound(w, r)
				return
			}
			p = "index.html"
			r = r.Clone(r.Context())
			r.URL.Path = "/"
		}
		switch {
		case strings.HasPrefix(p, "assets/"):
			h.Set("Cache-Control", "public, max-age=31536000, immutable")
		case p == "index.html", p == "sw.js", strings.HasPrefix(p, "workbox-"), p == "manifest.webmanifest":
			h.Set("Cache-Control", "no-cache")
		default:
			h.Set("Cache-Control", "public, max-age=3600")
		}
		files.ServeHTTP(w, r)
	})
}
