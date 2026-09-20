-- Accounts exist so a regular user keeps one voice clone across conversations instead of
-- burning provider credits on a new one every time. The invited person stays anonymous.
CREATE TABLE IF NOT EXISTS adu_users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS adu_users_email ON adu_users(lower(email));

-- One persistent voice per account. Kept out of adu_participants, which is session scoped
-- and purged, so the purge can never take a saved voice with it.
CREATE TABLE IF NOT EXISTS adu_voice_profiles (
  user_id uuid PRIMARY KEY REFERENCES adu_users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'elevenlabs',
  provider_voice_id text,
  voice_range text,
  voice_tier smallint NOT NULL DEFAULT 0,
  voice_status text NOT NULL DEFAULT 'none' CHECK (voice_status IN ('none','learning','ready','verification_required')),
  consent_at timestamptz,
  cloning_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE adu_participants ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES adu_users(id) ON DELETE SET NULL;
