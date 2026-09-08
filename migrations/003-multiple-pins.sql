BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM rackmap.schema_version WHERE version > 3) THEN
    RAISE EXCEPTION 'Newer RackMap schema; refusing migration';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS rackmap.pin_session_config(
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  secret text NOT NULL CHECK(length(secret)>=32)
);
CREATE TABLE IF NOT EXISTS rackmap.pin_keys(
  id text PRIMARY KEY CHECK(id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  label text NOT NULL,
  pin_hash text NOT NULL CHECK(pin_hash ~ '^[a-f0-9]{32}:[a-f0-9]{64}$'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rackmap.pin_session_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE rackmap.pin_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rackmap.pin_session_config,rackmap.pin_keys FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON rackmap.pin_session_config,rackmap.pin_keys FROM %I',role_name);
    END IF;
  END LOOP;
END $$;
INSERT INTO rackmap.schema_version VALUES(3) ON CONFLICT DO NOTHING;
COMMIT;
