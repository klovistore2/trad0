-- Progressive cloning: tier 0 means no clone, then each tier is a better sample of the
-- same voice. Consent is recorded once per session and gates every tier.
ALTER TABLE adu_participants ADD COLUMN IF NOT EXISTS voice_tier smallint NOT NULL DEFAULT 0;
