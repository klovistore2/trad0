CREATE TABLE IF NOT EXISTS adu_sessions (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour',
  closed boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS adu_participants (
  session_id uuid NOT NULL REFERENCES adu_sessions(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot IN (0, 1)),
  guest_hash text NOT NULL,
  language text NOT NULL CHECK (language IN ('fr','en','th')),
  last_seen timestamptz NOT NULL DEFAULT now(),
  voice_id text,
  voice_status text NOT NULL DEFAULT 'none' CHECK (voice_status IN ('none','learning','ready','verification_required')),
  consent_at timestamptz,
  cloning_until timestamptz,
  PRIMARY KEY (session_id, slot),
  UNIQUE (session_id, guest_hash)
);
CREATE TABLE IF NOT EXISTS adu_events (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  session_id uuid NOT NULL REFERENCES adu_sessions(id) ON DELETE CASCADE,
  sender smallint NOT NULL CHECK (sender IN (0,1)),
  turn_id uuid NOT NULL,
  text text NOT NULL CHECK (length(text) <= 4000),
  committed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adu_events_poll ON adu_events(session_id, seq);
CREATE INDEX IF NOT EXISTS adu_sessions_expiry ON adu_sessions(expires_at);
