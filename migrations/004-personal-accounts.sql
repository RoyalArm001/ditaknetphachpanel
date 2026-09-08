BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM rackmap.schema_version WHERE version > 4) THEN
    RAISE EXCEPTION 'Newer RackMap schema; refusing migration';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS rackmap.personal_accounts(
  user_id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  pin_hash text NOT NULL CHECK(pin_hash ~ '^[a-f0-9]{32}:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rackmap.personal_companies(
  user_id text NOT NULL REFERENCES rackmap.personal_accounts(user_id),
  id text NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
  body jsonb NOT NULL,
  PRIMARY KEY(user_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS personal_company_name ON rackmap.personal_companies(user_id,lower(body->>'company'));
CREATE TABLE IF NOT EXISTS rackmap.personal_history(
  user_id text NOT NULL,
  company_id text NOT NULL,
  revision integer NOT NULL,
  body jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,company_id,revision),
  FOREIGN KEY(user_id,company_id) REFERENCES rackmap.personal_companies(user_id,id)
);
ALTER TABLE rackmap.personal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rackmap.personal_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE rackmap.personal_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rackmap.personal_accounts,rackmap.personal_companies,rackmap.personal_history FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON rackmap.personal_accounts,rackmap.personal_companies,rackmap.personal_history FROM %I',role_name);
    END IF;
  END LOOP;
END $$;
INSERT INTO rackmap.schema_version VALUES(4) ON CONFLICT DO NOTHING;
COMMIT;
