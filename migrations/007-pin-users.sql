BEGIN;
ALTER TABLE rackmap.pin_keys ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user'));
ALTER TABLE rackmap.pin_keys ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
INSERT INTO rackmap.schema_version VALUES(7) ON CONFLICT DO NOTHING;
COMMIT;
