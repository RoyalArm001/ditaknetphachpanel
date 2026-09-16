BEGIN;
CREATE TABLE IF NOT EXISTS rackmap.live_presence(
  scope text NOT NULL,
  actor_id text NOT NULL,
  client_id text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope,actor_id,client_id)
);
CREATE INDEX IF NOT EXISTS live_presence_seen ON rackmap.live_presence(seen_at);
ALTER TABLE rackmap.live_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rackmap.live_presence FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON rackmap.live_presence FROM %I',role_name);
    END IF;
  END LOOP;
END $$;
INSERT INTO rackmap.schema_version VALUES(6) ON CONFLICT DO NOTHING;
COMMIT;
