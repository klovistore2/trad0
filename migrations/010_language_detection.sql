-- Keep a usable output language while waiting for the speaker's first transcript.
ALTER TABLE adu_participants ADD COLUMN IF NOT EXISTS language_auto boolean NOT NULL DEFAULT true;
ALTER TABLE adu_participants ADD COLUMN IF NOT EXISTS language_detected boolean NOT NULL DEFAULT false;
ALTER TABLE adu_participants ADD COLUMN IF NOT EXISTS language_revision integer NOT NULL DEFAULT 0;
ALTER TABLE adu_participants ADD COLUMN IF NOT EXISTS language_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE adu_participants ADD COLUMN IF NOT EXISTS language_checked_at timestamptz;
ALTER TABLE adu_sessions ADD COLUMN IF NOT EXISTS peer_language_auto boolean NOT NULL DEFAULT true;
