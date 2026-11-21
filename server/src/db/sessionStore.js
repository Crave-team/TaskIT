import { createHash, randomBytes } from 'node:crypto';
import { SessionModel } from './models.js';
import { settingsStore } from '../../../src/api/repo.js';

/**
 * Sessions in MongoDB. The cookie holds a random 256-bit token; only its SHA-256 hash is stored, so a
 * leaked database cannot be used to hijack a session. A session ends when it is:
 *   - older than `maxDays` (MongoDB's TTL index deletes the row at `expiresAt`),
 *   - idle for longer than the admin's "Session timeout" setting (checked on every request),
 *   - destroyed explicitly (log out, ban, account deletion).
 */
const hash = (token) => createHash('sha256').update(token).digest('hex');
const TOUCH_EVERY_MS = 60 * 1000; // don't write on every single request

export function createSessionStore({ maxDays = 30 } = {}) {
  return {
    async create(userId) {
      const token = randomBytes(32).toString('hex');
      const now = new Date();
      await SessionModel.create({ _id: hash(token), userId, createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + maxDays * 86400000) });
      return token;
    },

    async userIdFor(token) {
      if (typeof token !== 'string' || token.length < 32 || token.length > 200) return null;
      const id = hash(token);
      const session = await SessionModel.findById(id).lean();
      if (!session) return null;
      const now = Date.now();
      const { sessionTimeout } = await settingsStore.get();
      const idleMs = (Number(sessionTimeout) || 0) * 60 * 1000;
      if (session.expiresAt.getTime() <= now || (idleMs && now - session.lastSeenAt.getTime() > idleMs)) {
        await SessionModel.deleteOne({ _id: id });
        return null;
      }
      if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) await SessionModel.updateOne({ _id: id }, { $set: { lastSeenAt: new Date(now) } });
      return session.userId;
    },

    async destroy(token) {
      if (typeof token === 'string' && token) await SessionModel.deleteOne({ _id: hash(token) });
    },

    async destroyAllFor(userId) {
      await SessionModel.deleteMany({ userId });
    },
  };
}
