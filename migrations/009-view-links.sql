BEGIN;
CREATE TABLE IF NOT EXISTS rackmap.view_links(
  token text PRIMARY KEY,
  scope text NOT NULL,
  company_id text NOT NULL,
  title text NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  pdf bytea NOT NULL
);
CREATE INDEX IF NOT EXISTS view_links_project ON rackmap.view_links(scope,company_id);
ALTER TABLE rackmap.view_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rackmap.view_links FROM PUBLIC;
INSERT INTO rackmap.schema_version VALUES(9) ON CONFLICT DO NOTHING;
COMMIT;
