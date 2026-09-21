-- Using the saved clone can be turned off without deleting it, so the speaker can compare
-- it against the standard voice, or fall back without losing the model.
ALTER TABLE adu_participants ADD COLUMN IF NOT EXISTS use_clone boolean NOT NULL DEFAULT true;
ALTER TABLE adu_voice_profiles ADD COLUMN IF NOT EXISTS use_clone boolean NOT NULL DEFAULT true;
