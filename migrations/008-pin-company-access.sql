BEGIN;
CREATE TABLE IF NOT EXISTS rackmap.pin_company_access(
  pin_id text NOT NULL REFERENCES rackmap.pin_keys(id) ON DELETE CASCADE,
  company_id text NOT NULL REFERENCES rackmap.companies(id) ON DELETE CASCADE,
  PRIMARY KEY(pin_id,company_id)
);
INSERT INTO rackmap.pin_company_access(pin_id,company_id)
SELECT p.id,c.id FROM rackmap.pin_keys p CROSS JOIN rackmap.companies c WHERE p.role='user'
ON CONFLICT DO NOTHING;
ALTER TABLE rackmap.pin_company_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rackmap.pin_company_access FROM PUBLIC;
INSERT INTO rackmap.schema_version VALUES(8) ON CONFLICT DO NOTHING;
COMMIT;
