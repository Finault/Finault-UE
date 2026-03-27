/**
 * Finault Status Page D1 Schema
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tables for tracking health checks and uptime data
 */

-- Health checks table: stores each gateway health check
CREATE TABLE IF NOT EXISTS health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('operational', 'degraded', 'down')),
  latency_ms INTEGER,
  status_code INTEGER,
  seal_rate REAL,
  details TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp ON health_checks(timestamp);
CREATE INDEX IF NOT EXISTS idx_health_checks_status ON health_checks(status);
CREATE INDEX IF NOT EXISTS idx_health_checks_date ON health_checks(DATE(timestamp));

-- Incidents table: tracks known incidents
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK(status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  severity TEXT CHECK(severity IN ('minor', 'major', 'critical')),
  started_at TEXT NOT NULL,
  resolved_at TEXT,
  affected_components TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_started_at ON incidents(started_at);

-- Incident updates table: status updates for ongoing incidents
CREATE TABLE IF NOT EXISTS incident_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  timestamp TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(incident_id) REFERENCES incidents(id)
);

CREATE INDEX IF NOT EXISTS idx_incident_updates_incident_id ON incident_updates(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_updates_timestamp ON incident_updates(timestamp);

-- Maintenance windows table: tracks scheduled maintenance
CREATE TABLE IF NOT EXISTS maintenance_windows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_start TEXT NOT NULL,
  scheduled_end TEXT NOT NULL,
  actual_start TEXT,
  actual_end TEXT,
  status TEXT NOT NULL CHECK(status IN ('scheduled', 'in_progress', 'completed')),
  affected_components TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_maintenance_windows_scheduled_start ON maintenance_windows(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_maintenance_windows_status ON maintenance_windows(status);
