-- Explicit turn taking: exactly one participant holds the floor at a time.
-- The creator (slot 0) starts with it so the first speaker never has to ask.
ALTER TABLE adu_sessions ADD COLUMN IF NOT EXISTS floor_slot smallint NOT NULL DEFAULT 0;
ALTER TABLE adu_sessions DROP CONSTRAINT IF EXISTS adu_sessions_floor_slot_check;
ALTER TABLE adu_sessions ADD CONSTRAINT adu_sessions_floor_slot_check CHECK (floor_slot IN (0, 1));
