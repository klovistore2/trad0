-- The 13 output languages the translation model documents, plus Thai: the project's primary
-- target, which the documentation lists only as an INPUT language. Kept selectable so the
-- limitation can be verified with real speech rather than assumed.
ALTER TABLE adu_participants DROP CONSTRAINT IF EXISTS adu_participants_language_check;
ALTER TABLE adu_participants ADD CONSTRAINT adu_participants_language_check
  CHECK (language IN ('en','fr','es','pt','ja','ru','zh','de','ko','hi','id','vi','it','th'));
-- Chosen when the conversation is created. The joiner takes it when the second seat is filled.
ALTER TABLE adu_sessions ADD COLUMN IF NOT EXISTS peer_language text NOT NULL DEFAULT 'en';
