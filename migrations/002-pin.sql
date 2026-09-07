BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM rackmap.schema_version WHERE version > 2) THEN
    RAISE EXCEPTION 'Newer RackMap schema; refusing migration';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS rackmap.pin_attempts(key text PRIMARY KEY,attempts integer NOT NULL,started_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE rackmap.pin_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rackmap.pin_attempts FROM PUBLIC;
INSERT INTO rackmap.schema_version VALUES(2) ON CONFLICT DO NOTHING;
COMMIT;
