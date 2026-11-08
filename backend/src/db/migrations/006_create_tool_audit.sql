-- Mnemo - journal des appels d'outils (v0.5)
-- Pas de clé étrangère vers conversations : le journal doit survivre à la suppression d'une conversation.
CREATE TABLE IF NOT EXISTS tool_audit (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  conversation_id UUID,
  tool TEXT NOT NULL,
  args JSONB,
  status TEXT NOT NULL CHECK (status IN (
    'executed', 'error', 'rejected', 'confirmation_requested', 'confirmed', 'denied', 'expired'
  )),
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tool_audit_user_idx ON tool_audit (user_id, created_at DESC);
