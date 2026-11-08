-- Mnemo - nombre de phrases d'un document qui s'adressent à une IA (retirées avant le modèle)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS flagged_count INTEGER NOT NULL DEFAULT 0;
