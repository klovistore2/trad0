-- An account created through Google has no password, so the hash becomes optional.
ALTER TABLE adu_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE adu_users ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'password';
