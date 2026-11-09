import { app } from './app';
import { env } from './env';
import { prisma } from './prisma';

const server = app.listen(env.port, () => {
  console.log(`[server] OnePerson_LA backend listening on http://localhost:${env.port}`);
  console.log(`[server] env=${env.nodeEnv}`);
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] received ${signal}, shutting down...`);
  server.close(() => {
    prisma
      .$disconnect()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
