/**
 * A throw-away server for the browser test `e2e/s10_two_tabs.py`: the REAL Express app and built front end on the
 * in-memory repository, with uploads on a temporary disk folder (so file URLs are the real, authenticated
 * `/api/files/:id/content` ones). Email codes are off. Never use this outside testing. Env: STATIC_DIR, PORT.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { createApp } from '../src/http/app.js';
import { serverConfig } from '../src/config.js';
import { createDiskStorage } from '../src/db/diskStorage.js';
import { setStorage } from '../../src/api/storage.js';
import { config as apiConfig } from '../../src/api/config.js';
import { setMailer } from '../../src/api/mailer.js';

apiConfig.EMAIL_CODE_REQUIRED = false;
// Every "email" is appended to a file the browser test reads (no mail account needed), so password reset can be tried.
setMailer(async (message) => { fs.appendFileSync(process.env.MAIL_LOG || '/tmp/taskit-e2e-mail.jsonl', `${JSON.stringify(message)}\n`); });
setStorage(createDiskStorage(fs.mkdtempSync(path.join(os.tmpdir(), 'taskit-e2e-uploads-'))));

const app = createApp({ config: { ...serverConfig, isTest: true, rateLimit: false, cookieSecure: false, googleClientId: '', staticDir: process.env.STATIC_DIR } });
// E2E_DELAY_MS slows every API answer down, to mimic a remote database (the first load after a refresh is where it shows).
const delay = Number(process.env.E2E_DELAY_MS) || 0;
const served = delay
  ? (() => { const wrapper = express(); wrapper.use((_req, _res, next) => setTimeout(next, delay)); wrapper.use(app); return wrapper; })()
  : app;
const port = Number(process.env.PORT) || 4173;
served.listen(port, '127.0.0.1', () => console.log(`e2e two-tabs server on http://127.0.0.1:${port}`));
