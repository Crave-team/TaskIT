import { newId } from './ids.js';
import { DEFAULT_SYSTEM_SETTINGS } from './config.js';

/**
 * The repository: the ONLY thing the services use to read and write data.
 *
 * Every method is ASYNC (like MongoDB) and takes MONGO-STYLE FILTERS, so the in-memory
 * implementation below and the Mongoose implementation in `server/src/db/mongoRepo.js` are
 * interchangeable. The services never know which one is plugged in (`setRepository(impl)`).
 *
 * Collection interface
 *   find(filter)                         -> docs[]
 *   findOne(filter)                      -> doc | null
 *   get(id)                              -> doc | null
 *   count(filter)                        -> number
 *   insert(doc)                          -> doc (an `id` is generated if missing)
 *   update(id, patch, ops?)              -> doc | null, ONE atomic operation:
 *        patch  = fields to set
 *        ops    = { push:    { field: item | items[] },        append to an array
 *                   pull:    { field: { id } },                remove the element with that id
 *                   patchIn: { field: { id, patch } },         change fields of one array element
 *                   addToSet:{ field: value },                 add a plain value to an array if absent
 *                   pullValue:{ field: value },                remove a plain value from an array
 *                   unset:   ['a.b', ...] }                    delete (dotted) fields
 *        `patch` keys may be dotted paths ('reactions.<userId>') to set one nested key atomically.
 *      Use ops instead of rebuilding an array in the service: two people adding a subtask at the
 *      same moment must both succeed (read-edit-write would lose one).
 *   remove(id)                           -> doc | null
 *   removeWhere(filter)                  -> removed docs[]
 *   page(filter, { limit, before })      -> newest-first by id; `before` is an id cursor
 *
 * Filters: equality, `null`, `{ $in: [...] }`, `{ $ne: x }`, and dotted paths into arrays
 * (`'attachments.fileId': id` matches if ANY element matches), as in MongoDB.
 */
const clone = (v) => (v === undefined ? v : structuredClone(v));

/** Values found at a dotted path, flattening arrays on the way (MongoDB semantics). */
function valuesAt(doc, path) {
  let current = [doc];
  for (const key of path.split('.')) {
    current = current.flatMap((c) => {
      if (c == null) return [];
      const v = c[key];
      return Array.isArray(v) ? v : [v];
    });
  }
  return current;
}

function matches(doc, filter) {
  return Object.entries(filter).every(([key, cond]) => {
    const values = valuesAt(doc, key);
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('$in' in cond) return values.some((v) => cond.$in.includes(v));
      if ('$ne' in cond) return values.every((v) => (v ?? null) !== (cond.$ne ?? null));
    }
    return values.some((v) => (v ?? null) === (cond ?? null)) || (values.length === 0 && cond == null);
  });
}

/** Applies `patch` and the array `ops` to a document copy (mirrors the Mongo update). */
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k) => { o[k] = { ...(o[k] || {}) }; o = o[k]; });
  o[keys.at(-1)] = value;
}
function unsetPath(obj, path) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) { if (o[k] == null) return; o[k] = { ...o[k] }; o = o[k]; }
  delete o[keys.at(-1)];
}

function applyUpdate(doc, patch = {}, ops = {}) {
  const next = { ...doc };
  Object.entries(clone(patch)).forEach(([k, v]) => (k.includes('.') ? setPath(next, k, v) : (next[k] = v)));
  (ops.unset || []).forEach((p) => unsetPath(next, p));
  Object.entries(ops.addToSet || {}).forEach(([field, value]) => {
    if (!(next[field] || []).includes(value)) next[field] = [...(next[field] || []), value];
  });
  Object.entries(ops.pullValue || {}).forEach(([field, value]) => {
    next[field] = (next[field] || []).filter((v) => v !== value);
  });
  Object.entries(ops.push || {}).forEach(([field, value]) => {
    next[field] = [...(next[field] || []), ...clone(Array.isArray(value) ? value : [value])];
  });
  Object.entries(ops.pull || {}).forEach(([field, spec]) => {
    next[field] = (next[field] || []).filter((e) => e.id !== spec.id);
  });
  Object.entries(ops.patchIn || {}).forEach(([field, spec]) => {
    next[field] = (next[field] || []).map((e) => (e.id === spec.id ? { ...e, ...clone(spec.patch) } : e));
  });
  return next;
}

class Collection {
  constructor(name) {
    this.name = name;
    this.docs = [];
  }

  async find(filter = {}) {
    return this.docs.filter((d) => matches(d, filter)).map(clone);
  }

  async findOne(filter) {
    const d = this.docs.find((x) => matches(x, filter));
    return d ? clone(d) : null;
  }

  async get(id) {
    return typeof id === 'string' && id ? this.findOne({ id }) : null;
  }

  async count(filter = {}) {
    return this.docs.filter((d) => matches(d, filter)).length;
  }

  async insert(doc) {
    const stored = { ...clone(doc), id: doc.id || newId() };
    this.docs.push(stored);
    return clone(stored);
  }

  async update(id, patch = {}, ops = {}) {
    const i = this.docs.findIndex((d) => d.id === id);
    if (i < 0) return null;
    this.docs[i] = applyUpdate(this.docs[i], patch, ops);
    return clone(this.docs[i]);
  }

  async remove(id) {
    const i = this.docs.findIndex((d) => d.id === id);
    if (i < 0) return null;
    return clone(this.docs.splice(i, 1)[0]);
  }

  async removeWhere(filter) {
    const gone = this.docs.filter((d) => matches(d, filter));
    this.docs = this.docs.filter((d) => !matches(d, filter));
    return gone.map(clone);
  }

  /** Newest-first page. `before` is an id cursor; ids increase in creation order (see ids.js). */
  async page(filter = {}, { limit = 100, before = null } = {}) {
    return this.docs
      .filter((d) => matches(d, filter) && (!before || d.id < before))
      .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .slice(0, limit)
      .map(clone);
  }
}

export const COLLECTIONS = [
  'authChallenges',
  'users', 'groups', 'joinRequests', 'roleChanges', 'messages', 'teamAnnouncements',
  'projects', 'tasks', 'reminders', 'notifications', 'activity', 'files',
];

export { DEFAULT_SYSTEM_SETTINGS };

/** The in-memory repository used by the browser demo and by the fast service tests. */
function createMemoryRepository() {
  const collections = Object.fromEntries(COLLECTIONS.map((n) => [n, new Collection(n)]));
  let settings = { ...DEFAULT_SYSTEM_SETTINGS };
  return {
    collections,
    settings: {
      get: async () => ({ ...settings }),
      set: async (patch) => {
        settings = { ...settings, ...patch };
        return { ...settings };
      },
    },
    /** Runs `fn` as one unit. (Memory has no rollback; the Mongo repository uses a real transaction.) */
    transaction: async (fn) => fn(),
    reset: async () => {
      Object.values(collections).forEach((c) => { c.docs = []; });
      settings = { ...DEFAULT_SYSTEM_SETTINGS };
    },
  };
}

let current = createMemoryRepository();

/** Plug in another repository (the Mongoose one on the server). Call once at start-up. */
export function setRepository(impl) {
  current = impl;
}

/** `db.tasks.find(...)`, `db.users.get(id)`... always forwarded to the active repository. */
export const db = new Proxy({}, {
  get: (_, name) => {
    const c = current.collections[name];
    if (!c) throw new Error(`Unknown collection "${String(name)}"`);
    return c;
  },
});

/** The single site-settings document. */
export const settingsStore = {
  get: () => current.settings.get(),
  set: (patch) => current.settings.set(patch),
};

/** Run several writes as one unit (a MongoDB transaction when the server enables them). */
export const transaction = (fn) => current.transaction(fn);

/** Test helper: wipe everything. */
export const resetDatabase = () => current.reset();
