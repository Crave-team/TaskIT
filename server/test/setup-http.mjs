/**
 * Preloaded before the service tests to run them THROUGH HTTP: boots the real Express app (in this process,
 * on a random port, backed by MongoDB) and points the browser's HTTP client at it (which holds its own
 * session token). Every `api.*` call in the tests then travels: client -> Express -> services -> Mongoose -> database.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { after } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DB = 'mongo';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/taskit_test';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'taskit-uploads-'));

const { createServer } = await import('../src/server.js');
const { configureHttp } = await import('../../src/api/http.js');

const { app, close } = await createServer();
const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
process.env.TASKIT_API_URL = baseUrl;

// The HTTP client keeps the session token itself (in memory here, in sessionStorage in a browser) and sends it as
// `Authorization: Bearer ...`, so plain `fetch` is all it needs.
configureHttp({ baseUrl });

globalThis.__taskitTest = { baseUrl };
after(async () => {
  await new Promise((r) => server.close(r));
  await close();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});
