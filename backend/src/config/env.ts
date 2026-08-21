import 'dotenv/config';

function readEnv(name: string, fallback: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  return value;
}

export const env = {
  PORT: Number(readEnv('PORT', '3000')),
  OLLAMA_BASE_URL: readEnv('OLLAMA_BASE_URL', 'http://localhost:11434'),
  OLLAMA_MODEL: readEnv('OLLAMA_MODEL', 'stella:latest'),
};
