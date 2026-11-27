-- Passwords set by an admin (or the bootstrap) are final: nobody is sent to "change your password"
-- on first login anymore. Clear the flag left on existing accounts.
UPDATE users SET must_change_password = 0 WHERE must_change_password != 0;
