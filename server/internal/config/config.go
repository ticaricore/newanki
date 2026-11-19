// Package config reads server configuration from flags and NEWANKI_* environment variables.
package config

import (
	"flag"
	"os"
	"strconv"
)

// Config is the runtime configuration of `newanki serve`.
type Config struct {
	Addr          string // listen address
	DataDir       string // holds main.db and users/
	Dev           bool   // dev mode: demo user + seed data, insecure cookies allowed
	CookieSecure  bool   // set the Secure attribute on the session cookie
	TrustProxy    bool   // trust X-Forwarded-For for client IPs (rate limiting)
	AdminEmail    string // bootstrap admin email (first start only)
	AdminPassword string // bootstrap admin password (first start only)
}

// Load parses flags from args, with environment variables as defaults.
func Load(args []string) (Config, error) {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	c := Config{}
	fs.StringVar(&c.Addr, "addr", env("NEWANKI_ADDR", ":8080"), "listen address")
	fs.StringVar(&c.DataDir, "data", env("NEWANKI_DATA_DIR", "./data"), "data directory")
	fs.BoolVar(&c.Dev, "dev", envBool("NEWANKI_DEV", false), "development mode (seed demo data)")
	secure := fs.String("cookie-secure", env("NEWANKI_COOKIE_SECURE", ""), "Secure session cookie (default: true unless -dev)")
	fs.BoolVar(&c.TrustProxy, "trust-proxy", envBool("NEWANKI_TRUST_PROXY", false), "trust X-Forwarded-For")
	fs.StringVar(&c.AdminEmail, "admin-email", env("NEWANKI_ADMIN_EMAIL", "admin@newanki.local"), "bootstrap admin email")
	fs.StringVar(&c.AdminPassword, "admin-password", env("NEWANKI_ADMIN_PASSWORD", "Admin123!"), "bootstrap admin password")
	if err := fs.Parse(args); err != nil {
		return c, err
	}
	if *secure == "" {
		c.CookieSecure = !c.Dev
	} else {
		v, err := strconv.ParseBool(*secure)
		if err != nil {
			return c, err
		}
		c.CookieSecure = v
	}
	return c, nil
}

func env(key, def string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return def
}

func envBool(key string, def bool) bool {
	if v, ok := os.LookupEnv(key); ok {
		b, err := strconv.ParseBool(v)
		if err == nil {
			return b
		}
	}
	return def
}
