/**
 * Preloaded (`node --import`) before the service tests so they run against MongoDB instead of the
 * in-memory repository: the SAME tests, a different database. Needs a MongoDB-compatible server
 * (set MONGODB_URI; defaults to a local `taskit_test` database).
 */
import { after } from 'node:test';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.TEST_DB = 'mongo';
const { mongoose } = await import('../src/db/models.js');
const { createMongoRepository, ensureIndexes } = await import('../src/db/mongoRepo.js');
const { createSessionStore } = await import('../src/db/sessionStore.js');
const { setRepository } = await import('../../src/api/repo.js');
const { setSessionStore } = await import('../../src/api/session.js');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/taskit_test';
await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
setRepository(createMongoRepository({ useTransactions: process.env.MONGO_TRANSACTIONS === 'true' }));
setSessionStore(createSessionStore());
await ensureIndexes();
after(() => mongoose.disconnect());
