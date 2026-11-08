-- STELLA AI — mémoire persistante
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT memories_user_id_key_unique UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS memories_user_id_idx ON memories (user_id);
