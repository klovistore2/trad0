-- Dutch is selectable in the UI and must also be accepted by PostgreSQL.
-- Keep 009 in sync: the migration runner replays all migrations on existing data.
ALTER TABLE adu_participants DROP CONSTRAINT IF EXISTS adu_participants_language_check;
ALTER TABLE adu_participants ADD CONSTRAINT adu_participants_language_check
  CHECK (language IN ('en','fr','es','pt','ja','ru','zh','de','ko','hi','id','vi','it','th','nl'));
