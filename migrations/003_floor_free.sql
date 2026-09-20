-- No one holds the floor until someone asks for it, so a microphone is never
-- open by accident and cannot capture the person speaking at the other device.
ALTER TABLE adu_sessions ALTER COLUMN floor_slot DROP NOT NULL;
ALTER TABLE adu_sessions ALTER COLUMN floor_slot DROP DEFAULT;
