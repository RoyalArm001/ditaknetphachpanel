BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM rackmap.schema_version WHERE version > 4) THEN
    RAISE EXCEPTION 'Newer RackMap schema; refusing migration';
  END IF;
END $$;
ALTER TABLE rackmap.personal_accounts ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';
ALTER TABLE rackmap.personal_accounts ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
ALTER TABLE rackmap.personal_accounts ADD COLUMN IF NOT EXISTS username text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS personal_account_username
  ON rackmap.personal_accounts(lower(username)) WHERE username <> '';
INSERT INTO rackmap.schema_version VALUES(5) ON CONFLICT DO NOTHING;
COMMIT;
