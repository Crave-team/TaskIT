import mongoose from 'mongoose';
import { serverConfig, assertProductionSafe } from './config.js';
import { createMongoRepository, ensureIndexes } from './db/mongoRepo.js';
import { createSessionStore } from './db/sessionStore.js';
import { createDiskStorage } from './db/diskStorage.js';
import { createApp } from './http/app.js';
import { setRepository } from '../../src/api/repo.js';
import { setSessionStore } from '../../src/api/session.js';
import { setStorage } from '../../src/api/storage.js';
import { setGoogleVerifier } from '../../src/api/google.js';
import { setMailer } from '../../src/api/mailer.js';
import { config as apiConfig } from '../../src/api/config.js';
import { createGoogleVerifier } from './http/google.js';
import { chooseMailer } from './http/mailer.js';

/**
 * Wires the framework-free services to MongoDB, plugs in server-side sessions and disk storage, and
 * returns the Express app. Used by `index.js` and by the HTTP tests.
 */
export async function createServer(overrides = {}) {
  const config = { ...serverConfig, ...overrides };
  assertProductionSafe();
  apiConfig.ADMIN_INVITE_CODE = config.adminInviteCode;
  apiConfig.GOOGLE_CLIENT_ID = config.googleClientId;
  if (config.googleClientId) setGoogleVerifier(createGoogleVerifier(config.googleClientId));

  // Email codes: pick the sender, and refuse to start if codes are REQUIRED but could never be delivered (never fail open).
  const { mode, mailer } = chooseMailer(config);
  setMailer(mailer);
  apiConfig.EMAIL_CODE_REQUIRED = config.requireEmailCode;
  if (config.requireEmailCode && mode === 'off') {
    throw new Error('Email codes are required but no mail account is set up. Set SMTP_HOST, SMTP_USER and SMTP_PASS (see .env.example), or set EMAIL_CODE_REQUIRED=false.');
  }
  if (mode === 'console') console.log('Email codes are printed in this window (development only). Set SMTP_* in .env to send real emails.');

  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  setRepository(createMongoRepository({ useTransactions: config.useTransactions }));
  setSessionStore(createSessionStore({ maxDays: config.sessionMaxDays }));
  setStorage(createDiskStorage(config.uploadDir));
  await ensureIndexes();

  return { app: createApp({ config }), config, close: () => mongoose.disconnect() };
}
