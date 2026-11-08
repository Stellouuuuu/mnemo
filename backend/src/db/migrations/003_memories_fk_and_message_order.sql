-- Mnemo — FK memories → users + index d'ordre des messages
-- Compatible données existantes : backfill des users avant la contrainte.

INSERT INTO users (id)
SELECT DISTINCT user_id
FROM memories
ON CONFLICT (id) DO NOTHING;

ALTER TABLE memories
  ADD CONSTRAINT memories_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS messages_conversation_created_id_idx
  ON messages (conversation_id, created_at, id);
