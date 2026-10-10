# Backup deployment and verification

Put secrets in the local, git-ignored `.env.local` or process environment. Do not paste cookies or database passwords into reports.

Required: `DATABASE_URL` (PostgreSQL URI, not a Supabase HTTPS project URL). Existing `POSTGRES_URL` is also accepted. Use the database owner/operator connection with permission to install `pg_cron`; TLS certificates are verified using the existing cloud connection configuration.

```powershell
npm run cloud:backup:migrate
```

Requires schema 009 or later. Reapplies idempotent migration 010, creates private session/audit tables (011), and verifies the hourly cron schedule and lock contention with two database transactions. Migration 010 creates a snapshot and removes snapshots older than 72 hours. It does not restore or replace project data. SQL failure rolls back the migration transaction; a later verification failure does not undo a committed migration. Re-running is safe.

For live API verification, set `CLOUD_VERIFY_URL`, `CLOUD_VERIFY_COOKIE` (the complete Cookie request header for an authorized session), and `CLOUD_VERIFY_COMPANY` to an existing company ID accessible to that session. Set `CLOUD_VERIFY_SPACE=account` to verify a personal workspace, otherwise use `shared`.

```powershell
npm run cloud:backup:verify
```

This creates another snapshot, verifies `/api/backup/status`, and confirms that exact snapshot appears in `/api/backup/list` for the selected workspace. HTTP redirects and non-HTTPS targets are rejected. Only verification flags and timestamp are printed on success. Run for both shared and account workspaces using their respective credentials to verify both scopes. Unit tests with simulated responses do not replace this live check.

## Session and audit behavior

The latest successful login with a PIN invalidates earlier sessions for that PIN. Daily cookie renewal preserves the same session identity. Different PINs and personal/team namespaces remain independent. Existing pre-update PIN sessions require one fresh login; no project data is removed.

Audit records contain actor ID, IP, timestamp, action and target ID. They never contain raw PINs, tokens, passwords or project content. Settings → Activity history is restricted to the main PIN in shared mode and the account owner in personal mode; records are paginated by 100 entries. Audit insertion happens after the action; if it fails, the server returns an explicit error saying the action completed but recording failed. Refresh before retrying. Mutation and audit insertion are not one database transaction.

## Current live evidence

2026-10-10: local tests cover runner failure handling, API checks, session replacement, and audit access/isolation. Live cloud verification has not been executed because database/API credentials are not available in this workspace.
