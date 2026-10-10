CREATE TABLE IF NOT EXISTS rackmap.active_pin_sessions(
  namespace text NOT NULL, actor text NOT NULL, digest text NOT NULL,
  PRIMARY KEY(namespace,actor)
);
CREATE TABLE IF NOT EXISTS rackmap.audit_log(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  space text NOT NULL CHECK(space IN ('shared','account')),
  owner text NOT NULL, actor text NOT NULL, ip text NOT NULL,
  action text NOT NULL, target text NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_owner ON rackmap.audit_log(space,owner,id DESC);
ALTER TABLE rackmap.active_pin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rackmap.audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rackmap.active_pin_sessions,rackmap.audit_log FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON rackmap.active_pin_sessions,rackmap.audit_log FROM %I',role_name);
    END IF;
  END LOOP;
END $$;
