BEGIN;
CREATE SCHEMA IF NOT EXISTS rackmap;
REVOKE ALL ON SCHEMA rackmap FROM PUBLIC;
CREATE TABLE IF NOT EXISTS rackmap.schema_version(version integer PRIMARY KEY);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM rackmap.schema_version WHERE version > 1) THEN
    RAISE EXCEPTION 'Newer RackMap schema; refusing migration';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS rackmap.companies(
  id text PRIMARY KEY,
  revision integer NOT NULL CHECK(revision>=0),
  body jsonb NOT NULL CHECK(body->>'schema'='2'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS company_names ON rackmap.companies(lower(trim(body->>'company'))) WHERE trim(body->>'company')<>'';
CREATE TABLE IF NOT EXISTS rackmap.company_history(
  company_id text NOT NULL REFERENCES rackmap.companies(id),
  revision integer NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  body jsonb NOT NULL,
  PRIMARY KEY(company_id,revision)
);
ALTER TABLE rackmap.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE rackmap.company_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE rackmap.schema_version ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA rackmap FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA rackmap FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA rackmap FROM %I',role_name);
    END IF;
  END LOOP;
END $$;
INSERT INTO rackmap.schema_version VALUES(1) ON CONFLICT DO NOTHING;
COMMIT;
