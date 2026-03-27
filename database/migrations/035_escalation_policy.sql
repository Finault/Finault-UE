-- Budget alert escalation chain
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS escalation_policy JSONB DEFAULT '[
  {"percent": 50, "notify": "engineer", "channel": "slack"},
  {"percent": 80, "notify": "team_lead", "channel": "slack"},
  {"percent": 100, "notify": "vp", "channel": "email"},
  {"percent": 120, "notify": "cto", "channel": "both", "action": "HALT"}
]'::jsonb;
