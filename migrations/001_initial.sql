CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, config TEXT NOT NULL, secrets TEXT NOT NULL,
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS checks (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 started_at INTEGER NOT NULL, trigger TEXT NOT NULL CHECK(trigger IN ('manual','scheduled')),
 success INTEGER NOT NULL, error TEXT, duration_ms INTEGER NOT NULL, slot TEXT,
 UNIQUE(project_id, slot)
);
CREATE INDEX IF NOT EXISTS checks_project_time ON checks(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS checks_time ON checks(started_at DESC);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, admin_version TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS login_limits_expiry ON login_limits(expires_at);
CREATE TABLE IF NOT EXISTS leases (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cron_runs (slot TEXT PRIMARY KEY, started_at INTEGER NOT NULL, finished_at INTEGER);
