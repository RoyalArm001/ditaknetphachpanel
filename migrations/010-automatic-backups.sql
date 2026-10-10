BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Private application snapshots, independent of the 50-revision editing history.
CREATE TABLE IF NOT EXISTS rackmap.automatic_backups(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  access_data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS automatic_backups_created ON rackmap.automatic_backups(created_at);
CREATE TABLE IF NOT EXISTS rackmap.automatic_backup_projects(
  backup_id bigint NOT NULL REFERENCES rackmap.automatic_backups(id) ON DELETE CASCADE,
  space text NOT NULL CHECK(space IN ('shared','account')),
  user_id text NOT NULL,
  company_id text NOT NULL,
  revision integer NOT NULL,
  body jsonb NOT NULL,
  PRIMARY KEY(backup_id,space,user_id,company_id)
);
CREATE INDEX IF NOT EXISTS automatic_backup_project_versions
  ON rackmap.automatic_backup_projects(space,user_id,company_id,revision);
ALTER TABLE rackmap.automatic_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE rackmap.automatic_backup_projects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rackmap.automatic_backups,rackmap.automatic_backup_projects FROM PUBLIC;

CREATE OR REPLACE FUNCTION rackmap.capture_automatic_backup() RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,rackmap,pg_temp AS $$
DECLARE backup_id bigint;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('hourly_cloud_backup')) THEN RETURN NULL; END IF;
  -- One SQL statement gives all projects and access records the same MVCC snapshot.
  WITH snapshot AS (
    INSERT INTO rackmap.automatic_backups(access_data)
    SELECT jsonb_build_object(
      'schema_version',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM rackmap.schema_version t),
      'personal_accounts',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM rackmap.personal_accounts t),
      'pin_keys',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM rackmap.pin_keys t),
      'pin_session_config',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM rackmap.pin_session_config t),
      'pin_company_access',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM rackmap.pin_company_access t),
      'view_links',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM rackmap.view_links t)
    ) RETURNING id
  ), projects AS (
    INSERT INTO rackmap.automatic_backup_projects(backup_id,space,user_id,company_id,revision,body)
    SELECT s.id,'shared','',c.id,c.revision,c.body FROM snapshot s CROSS JOIN rackmap.companies c
    UNION ALL
    SELECT s.id,'account',c.user_id,c.id,c.revision,c.body FROM snapshot s CROSS JOIN rackmap.personal_companies c
    RETURNING backup_id
  ) SELECT id INTO backup_id FROM snapshot;
  -- Remove only expired backup copies, and only after a new snapshot succeeded.
  DELETE FROM rackmap.automatic_backups b
    WHERE b.created_at < statement_timestamp()-interval '72 hours' AND b.id<>backup_id;
  RETURN backup_id;
END;
$$;
REVOKE ALL ON FUNCTION rackmap.capture_automatic_backup() FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON rackmap.automatic_backups,rackmap.automatic_backup_projects FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION rackmap.capture_automatic_backup() FROM %I',role_name);
    END IF;
  END LOOP;
END $$;
INSERT INTO rackmap.schema_version VALUES(10) ON CONFLICT DO NOTHING;
SELECT rackmap.capture_automatic_backup();
SELECT cron.schedule('rackmap-hourly-backup','0 * * * *','SELECT rackmap.capture_automatic_backup();');
COMMIT;
