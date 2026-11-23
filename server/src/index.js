import { createServer } from './server.js';

const { app, config, close } = await createServer();
const server = app.listen(config.port, () => {
  console.log(`TaskIT server listening on http://localhost:${config.port}  (${config.env}, transactions ${config.useTransactions ? 'on' : 'off'})`);
});

// Finish in-flight requests, then close the database connection.
const shutdown = (signal) => {
  console.log(`${signal} received, shutting down...`);
  app.locals.liveHub.closeAll(); // open live-update streams would otherwise keep the server from closing
  server.close(async () => { await close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
};
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));
