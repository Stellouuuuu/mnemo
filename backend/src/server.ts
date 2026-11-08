import app from './app.js';
import { env } from './config/env.js';
import { closeSharedResources } from './services/container.js';

const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`STELLA AI backend listening on http://${env.HOST}:${env.PORT}`);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`STELLA AI backend shutting down (${signal})`);

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  await closeSharedResources().catch(() => undefined);
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
