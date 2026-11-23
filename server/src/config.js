import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const bool = (v, fallback) => (v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

/** All server settings come from environment variables (see `.env.example`). */
export const serverConfig = {
  env: env.NODE_ENV || 'development',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT) || 3000,
  mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/taskit',
  // Multi-document transactions need a replica set (MongoDB Atlas has one). Leave off for a single local mongod.
  useTransactions: bool(env.MONGO_TRANSACTIONS, false),
  adminInviteCode: env.ADMIN_INVITE_CODE || 'ADMIN-2026',
  // OAuth client id for "Sign in with Google" (members and admins). Empty = the Google button is hidden.
  googleClientId: (env.GOOGLE_CLIENT_ID || '').trim(),
  // Email codes (the 6-digit second step). Required for everyone by default; set EMAIL_CODE_REQUIRED=false to make it opt-in.
  requireEmailCode: bool(env.EMAIL_CODE_REQUIRED, env.NODE_ENV !== 'test'),
  // The mail account that sends the codes (for Gmail: smtp.gmail.com, port 465, and a Google "app password").
  smtp: {
    host: (env.SMTP_HOST || '').trim(),
    port: Number(env.SMTP_PORT) || 465,
    secure: bool(env.SMTP_SECURE, (Number(env.SMTP_PORT) || 465) === 465),
    user: (env.SMTP_USER || '').trim(),
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || (env.SMTP_USER ? `TaskIT <${env.SMTP_USER.trim()}>` : ''),
  },
  // Where the browser app is served from, for CORS (only needed if it is NOT served by this server).
  clientOrigin: env.CLIENT_ORIGIN || '',
  cookieName: 'taskit_session',
  cookieSecure: bool(env.COOKIE_SECURE, env.NODE_ENV === 'production'),
  sessionMaxDays: Number(env.SESSION_MAX_DAYS) || 30,
  uploadDir: env.UPLOAD_DIR || path.resolve(here, '../uploads'),
  // The built front end (`npm run build` at the project root) is served from here.
  staticDir: env.STATIC_DIR || path.resolve(here, '../../dist'),
  rateLimit: bool(env.RATE_LIMIT, env.NODE_ENV !== 'test'),
  trustProxy: env.TRUST_PROXY || false,
};

/** Refuse to start in production with the default, publicly-known admin invite code. */
export function assertProductionSafe() {
  if (serverConfig.isProd && serverConfig.adminInviteCode === 'ADMIN-2026') {
    throw new Error('Set a private ADMIN_INVITE_CODE before running in production.');
  }
}
