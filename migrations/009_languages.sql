-- All 15 app languages. Thai and Dutch use the contextual pipeline for speech output.
-- Keep this constraint in sync with 012 because the runner replays every migration.
ALTER TABLE adu_participants DROP CONSTRAINT IF EXISTS adu_participants_language_check;
ALTER TABLE adu_participants ADD CONSTRAINT adu_participants_language_check
  CHECK (language IN ('en','fr','es','pt','ja','ru','zh','de','ko','hi','id','vi','it','th','nl'));
-- Chosen when the conversation is created. The joiner takes it when the second seat is filled.
ALTER TABLE adu_sessions ADD COLUMN IF NOT EXISTS peer_language text NOT NULL DEFAULT 'en';
