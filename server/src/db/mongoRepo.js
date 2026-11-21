import { AsyncLocalStorage } from 'node:async_hooks';
import { newId } from '../../../src/api/ids.js';
import { DEFAULT_SYSTEM_SETTINGS } from '../../../src/api/config.js';
import { COLLECTIONS } from '../../../src/api/repo.js';
import { models, SessionModel, SettingsModel, mongoose } from './models.js';

/**
 * The MongoDB (Mongoose) implementation of the repository interface documented in `src/api/repo.js`.
 * The services call it through `db.<collection>.<method>()` without knowing it is Mongo, which is the
 * whole point of the repository layer.
 *
 * Translation notes
 *  - our documents have `id`; MongoDB stores `_id` (the same string). Converted at this boundary only.
 *  - `update(id, patch, ops)` is ONE `findOneAndUpdate`: `patch` -> $set, and the array ops -> $push /
 *    $pull / $addToSet / arrayFilters, so each change is atomic on the server.
 *  - `transaction(fn)` runs inside a MongoDB session when transactions are enabled (replica set); the
 *    session is carried through every call by AsyncLocalStorage, so repository calls need no extra argument.
 */
const toDoc = (d) => {
  if (!d) return null;
  const { _id, ...rest } = d;
  return { id: _id, ...rest };
};
const fromDoc = ({ id, ...rest }) => ({ _id: id, ...rest });

/** `{ id: ... }` -> `{ _id: ... }`; operators and dotted paths pass straight through to MongoDB. */
function toFilter(filter = {}) {
  const out = {};
  for (const [k, v] of Object.entries(filter)) out[k === 'id' ? '_id' : k] = v;
  return out;
}

/** Builds the Mongo update document (and array filters) from `patch` + `ops`. */
function buildUpdate(patch = {}, ops = {}, { indexes = {}, elements = {} } = {}) {
  const update = {};
  const $set = { ...patch };
  Object.keys($set).forEach((k) => { if ($set[k] === undefined) delete $set[k]; });

  // Changing one element of an array: `indexes[field]` is the element's current position (see `update`),
  // so the change targets `field.<index>.key`.
  const filter = {};
  for (const [field, spec] of Object.entries(ops.patchIn || {})) {
    const i = indexes[field];
    if (i < 0 || i === undefined) continue; // the element is gone: nothing to change
    filter[`${field}.${i}.id`] = spec.id; // guard: only apply if the element is STILL at that position
    for (const [k, v] of Object.entries(spec.patch)) $set[`${field}.${i}.${k}`] = v;
  }
  if (Object.keys($set).length) update.$set = $set;
  if (ops.unset?.length) update.$unset = Object.fromEntries(ops.unset.map((p) => [p, '']));
  if (ops.push) {
    update.$push = Object.fromEntries(Object.entries(ops.push).map(([f, v]) => [f, Array.isArray(v) ? { $each: v } : v]));
  }
  if (ops.addToSet) update.$addToSet = { ...ops.addToSet };
  // Removing an element by id: `$pullAll` with the exact element we just read. (A conditional `$pull: { id }`
  // is correct on MongoDB but not honoured by every compatible server; this form is portable.)
  const $pullAll = {};
  for (const [f, el] of Object.entries(elements)) if (el) $pullAll[f] = [el];
  if (Object.keys($pullAll).length) update.$pullAll = $pullAll;
  const $pull = {};
  for (const [f, value] of Object.entries(ops.pullValue || {})) $pull[f] = value;
  if (Object.keys($pull).length) update.$pull = $pull;
  return { update, filter };
}

export function createMongoRepository({ useTransactions = false } = {}) {
  const sessionStore = new AsyncLocalStorage();
  const opt = (extra = {}) => {
    const session = sessionStore.getStore();
    return session ? { ...extra, session } : extra;
  };

  class MongoCollection {
    constructor(Model) {
      this.Model = Model;
    }

    async find(filter = {}) {
      const docs = await this.Model.find(toFilter(filter), null, opt()).sort({ _id: 1 }).lean();
      return docs.map(toDoc);
    }

    async findOne(filter) {
      return toDoc(await this.Model.findOne(toFilter(filter), null, opt()).sort({ _id: 1 }).lean());
    }

    async get(id) {
      // Only a plain string is an id: an object here could smuggle in a query operator (NoSQL injection).
      if (typeof id !== 'string' || !id) return null;
      return toDoc(await this.Model.findById(id, null, opt()).lean());
    }

    async count(filter = {}) {
      return this.Model.countDocuments(toFilter(filter), opt());
    }

    async insert(doc) {
      const stored = fromDoc({ ...doc, id: doc.id || newId() });
      const [created] = await this.Model.create([stored], opt());
      return toDoc(created.toObject());
    }

    async update(id, patch = {}, ops = {}) {
      if (typeof id !== 'string' || !id) return null;
      // Element-level changes (patch one element, remove one element) are compare-and-set: they act on the
      // element exactly as we read it, and if another request changed the array in between, nothing matches,
      // so we read again (a few attempts). Everything else is a single plain atomic update.
      const needsRead = Boolean(ops.patchIn || ops.pull);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const indexes = {};
        const elements = {};
        if (needsRead) {
          const current = await this.Model.findById(id, null, opt()).lean();
          if (!current) return null;
          for (const [field, spec] of Object.entries(ops.patchIn || {})) indexes[field] = (current[field] || []).findIndex((e) => e.id === spec.id);
          for (const [field, spec] of Object.entries(ops.pull || {})) elements[field] = (current[field] || []).find((e) => e.id === spec.id);
        }
        const { update, filter } = buildUpdate(patch, ops, { indexes, elements });
        if (Object.keys(update).length === 0) return this.get(id);
        const result = await this.Model.findOneAndUpdate({ _id: id, ...filter }, update, opt({ returnDocument: 'after', lean: true }));
        if (!needsRead) return toDoc(result);
        const stillThere = result && Object.entries(ops.pull || {}).some(([f, spec]) => elements[f] && (result[f] || []).some((e) => e.id === spec.id));
        if (result && !stillThere) return toDoc(result);
      }
      return this.get(id);
    }

    async remove(id) {
      if (typeof id !== 'string' || !id) return null;
      return toDoc(await this.Model.findOneAndDelete({ _id: id }, opt({ lean: true })));
    }

    async removeWhere(filter) {
      const docs = await this.find(filter);
      if (docs.length) await this.Model.deleteMany({ _id: { $in: docs.map((d) => d.id) } }, opt());
      return docs;
    }

    async page(filter = {}, { limit = 100, before = null } = {}) {
      const query = toFilter(filter);
      if (before) query._id = { $lt: before };
      const docs = await this.Model.find(query, null, opt()).sort({ _id: -1 }).limit(limit).lean();
      return docs.map(toDoc);
    }
  }

  const collections = Object.fromEntries(COLLECTIONS.map((name) => [name, new MongoCollection(models[name])]));

  return {
    collections,
    settings: {
      get: async () => {
        const doc = await SettingsModel.findById('system', null, opt()).lean();
        const { _id, ...rest } = doc || {};
        return { ...DEFAULT_SYSTEM_SETTINGS, ...rest };
      },
      set: async (patch) => {
        const doc = await SettingsModel.findOneAndUpdate({ _id: 'system' }, { $set: patch }, opt({ upsert: true, returnDocument: 'after', lean: true }));
        const { _id, ...rest } = doc;
        return { ...DEFAULT_SYSTEM_SETTINGS, ...rest };
      },
    },
    /**
     * One unit of work. With transactions enabled (MongoDB replica set) it is all-or-nothing; otherwise it
     * simply runs `fn` (each write is still individually atomic, and the services order cascades so a
     * half-finished run can safely be repeated).
     */
    transaction: async (fn) => {
      if (!useTransactions || sessionStore.getStore()) return fn(); // disabled, or already inside one
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => { result = await sessionStore.run(session, fn); });
        return result;
      } finally {
        await session.endSession();
      }
    },
    /** Test helper. */
    reset: async () => {
      await Promise.all([...Object.values(models), SessionModel, SettingsModel].map((M) => M.deleteMany({})));
    },
  };
}

/** Creates every collection and index (idempotent). Call once after connecting. */
export async function ensureIndexes() {
  const all = [...Object.values(models), SessionModel, SettingsModel];
  for (const Model of all) {
    await Model.createCollection().catch(() => {}); // already exists
    await Model.createIndexes();
  }
}
