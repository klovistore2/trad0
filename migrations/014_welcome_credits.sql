-- Welcome credits: granted once per account, at the first Google sign in after this change.
-- The unique index makes the grant idempotent, even when two sign ins race.
ALTER TABLE adu_credit_ledger DROP CONSTRAINT IF EXISTS adu_credit_ledger_kind_check;
ALTER TABLE adu_credit_ledger ADD CONSTRAINT adu_credit_ledger_kind_check
  CHECK (kind IN ('minute','tone','clone','grant','purchase','welcome'));
CREATE UNIQUE INDEX IF NOT EXISTS adu_credit_ledger_one_welcome ON adu_credit_ledger(user_id) WHERE kind='welcome';
