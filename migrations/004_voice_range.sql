-- Detected vocal range, used only to pick a fitting standard voice before a clone exists.
-- It is a pitch measurement, never a claim about the speaker, and stays correctable.
ALTER TABLE adu_participants ADD COLUMN IF NOT EXISTS voice_range text;
ALTER TABLE adu_participants DROP CONSTRAINT IF EXISTS adu_participants_voice_range_check;
ALTER TABLE adu_participants ADD CONSTRAINT adu_participants_voice_range_check CHECK (voice_range IN ('low', 'high'));
