/**
 * The signed-in session of THIS browser tab.
 *
 * The server's opaque session token is kept in `sessionStorage`, which the browser scopes to a single tab, and is sent
 * with every request as `Authorization: Bearer <token>`. (It used to live in one httpOnly cookie shared by every tab,
 * so signing in as a second account in another tab silently replaced the first tab's identity.)
 *
 * Trade-offs worth knowing:
 *  - closing the tab ends the sign-in (the token is gone), and reloading the tab keeps it;
 *  - script can read the token, unlike an httpOnly cookie, so the site's strict Content-Security-Policy
 *    (no third-party scripts) is what protects it from XSS.
 *
 * Where `sessionStorage` is missing or blocked (Node tests, some private modes) the token is kept in memory instead.
 */
const KEY = 'taskit.session';

function readStored() {
  try {
    return globalThis.sessionStorage?.getItem(KEY) || null;
  } catch {
    return null; // storage blocked by the browser
  }
}

function writeStored(value) {
  try {
    if (value) globalThis.sessionStorage?.setItem(KEY, value);
    else globalThis.sessionStorage?.removeItem(KEY);
  } catch {
    // Storage is full or blocked: the in-memory copy below still works for this page load.
  }
}

let token = readStored();
const listeners = new Set();

export const getSessionToken = () => token;

/** Stores (or, with `null`, forgets) this tab's session token and tells subscribers. */
export function setSessionToken(next) {
  const value = next || null;
  if (value === token) return;
  token = value;
  writeStored(value);
  listeners.forEach((fn) => fn(value));
}

/** Calls `fn` whenever this tab signs in, out, or switches account. Returns an unsubscribe function. */
export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
