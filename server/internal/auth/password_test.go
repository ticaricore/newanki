package auth

import "testing"

func TestHashAndVerify(t *testing.T) {
	h, err := HashPassword("Admin123!")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword("Admin123!", h) {
		t.Fatal("correct password rejected")
	}
	if VerifyPassword("admin123!", h) {
		t.Fatal("wrong password accepted")
	}
	if VerifyPassword("Admin123!", "garbage") {
		t.Fatal("garbage hash accepted")
	}
	h2, _ := HashPassword("Admin123!")
	if h == h2 {
		t.Fatal("hashes must be salted")
	}
}

func TestValidatePassword(t *testing.T) {
	for _, bad := range []string{"short1", "onlyletters", "12345678"} {
		if ValidatePassword(bad) == nil {
			t.Errorf("ValidatePassword(%q) = nil", bad)
		}
	}
	if err := ValidatePassword("Admin123!"); err != nil {
		t.Errorf("Admin123! rejected: %v", err)
	}
}

func TestSessionToken(t *testing.T) {
	tok, id, err := NewSessionToken()
	if err != nil {
		t.Fatal(err)
	}
	if SessionID(tok) != id || tok == id || len(id) != 64 {
		t.Fatalf("token/id mismatch: %q %q", tok, id)
	}
}
