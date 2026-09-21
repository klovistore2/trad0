ALTER TABLE adu_participants ADD COLUMN IF NOT EXISTS preferred_mode text NOT NULL DEFAULT 'auto' CHECK (preferred_mode IN ('auto','direct','context'));
ALTER TABLE adu_participants ADD COLUMN IF NOT EXISTS active_mode text NOT NULL DEFAULT 'direct' CHECK (active_mode IN ('direct','context'));
ALTER TABLE adu_events ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
-- Only connection descriptions: audio travels over WebRTC, never through PostgreSQL.
CREATE TABLE IF NOT EXISTS adu_audio_links (
  session_id uuid NOT NULL REFERENCES adu_sessions(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot IN (0,1)),
  epoch uuid NOT NULL,
  target_epoch uuid,
  description jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id,slot)
);
