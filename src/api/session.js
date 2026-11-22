/**
 * Sessions: token -> user id. The client only ever holds the opaque token; every service call
 * derives "who is asking" from it, never from an id the UI supplies.
 *
 * The store is swappable (`setSessionStore`): the browser demo keeps sessions in memory; the Express
 * server keeps them in MongoDB (hashed, with an expiry); the browser holds the token in its tab's sessionStorage and
 * sends it as an `Authorization: Bearer` header.
 * Tokens come from a cryptographic random source (they are secrets, unlike the ordered record ids).
 */
export function randomToken(bytes = 32) {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function createMemorySessionStore() {
  const sessions = new Map();
  return {
    create: async (userId) => {
      const token = randomToken();
      sessions.set(token, userId);
      return token;
    },
    userIdFor: async (token) => (token ? sessions.get(token) ?? null : null),
    destroy: async (token) => { sessions.delete(token); },
    destroyAllFor: async (userId) => {
      for (const [token, id] of sessions) if (id === userId) sessions.delete(token);
    },
  };
}

let store = createMemorySessionStore();
export const setSessionStore = (impl) => { store = impl; };

export const createSession = (userId) => store.create(userId);
export const userIdForToken = (token) => store.userIdFor(token);
export const destroySession = (token) => store.destroy(token);
export const destroySessionsFor = (userId) => store.destroyAllFor(userId);
