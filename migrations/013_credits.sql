-- Credit ledger, v1: append-only, one row per billable use, negative for usage. The balance is
-- the sum. The person who created the conversation pays for all of it, the guest's cloning included.
-- No foreign key to adu_sessions: conversations are purged, their billing history is not.
CREATE TABLE IF NOT EXISTS adu_credit_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES adu_users(id) ON DELETE CASCADE,
  session_id uuid,
  kind text NOT NULL CHECK (kind IN ('minute','tone','clone','grant','purchase')),
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adu_credit_ledger_user ON adu_credit_ledger(user_id, created_at);
CREATE INDEX IF NOT EXISTS adu_credit_ledger_session ON adu_credit_ledger(session_id);

-- Start of the last billed minute of a conversation; NULL until both people are first online.
ALTER TABLE adu_sessions ADD COLUMN IF NOT EXISTS billed_at timestamptz;
