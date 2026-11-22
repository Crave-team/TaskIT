import { routes, splitName } from './routes.js';
import { ApiError } from './errors.js';
import { getSessionToken, setSessionToken } from './clientSession.js';

/**
 * The NETWORKED implementation of the data layer: the same `api.<area>.<fn>(...)` surface as
 * `local.js`, but every call is an HTTP request to the Express server. It is generated from the shared
 * route table (`routes.js`), so it always matches the server.
 *
 *  - The session token belongs to THIS browser tab (`clientSession.js`, backed by sessionStorage) and is sent as
 *    `Authorization: Bearer ...`. The server returns it as `sessionToken` next to `data` when someone signs in. There is
 *    no cookie, so signing in as another account in another tab cannot change who this tab is.
 *  - Every request carries `X-Requested-With: taskit` (the server requires it on writes: CSRF defence).
 *  - Errors come back as `{ error: { status, code, message, field } }` and are rethrown as `ApiError`,
 *    exactly what the in-process version throws, so the UI handles both identically.
 */
let BASE = (import.meta.env?.VITE_API_URL || '/api').replace(/\/$/, '');
let doFetch = (...args) => fetch(...args);

/** Point the client at another server, or give it a different `fetch`. */
export function configureHttp({ baseUrl, fetchFn } = {}) {
  if (baseUrl) BASE = baseUrl.replace(/\/$/, '');
  if (fetchFn) doFetch = fetchFn;
}

async function request(method, path, { query, body, form } = {}) {
  const qs = query && Object.keys(query).length
    ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]))}`
    : '';
  const headers = { 'X-Requested-With': 'taskit' };
  const sentToken = getSessionToken();
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  let res;
  try {
    res = await doFetch(`${BASE}${path}${qs}`, { method, headers, body: payload, credentials: 'omit' });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  let json = null;
  try { json = await res.json(); } catch { /* an empty body is fine */ }
  if (!res.ok) {
    const e = json?.error || {};
    // UNAUTHORIZED means the server no longer knows this token (signed out elsewhere, expired, banned): forget it. (Other
    // 401s, like a wrong password, say nothing about the current session.) The comparison keeps a slow, late answer from
    // wiping a token that was issued after this request left.
    if (e.code === 'UNAUTHORIZED' && sentToken && getSessionToken() === sentToken) setSessionToken(null);
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Request failed (${res.status}).`, e.field);
  }
  if (typeof json?.sessionToken === 'string') setSessionToken(json.sessionToken);
  return json?.data;
}

/** Builds the URL, query and body for one call from its route row and the positional arguments. */
function build(spec, args) {
  const bodyMethod = ['POST', 'PUT', 'PATCH'].includes(spec.method);
  let path = spec.path;
  const query = {};
  const body = {};
  let wholeBody;
  spec.args.forEach((name, i) => {
    const value = args[i];
    if (name === '$body') wholeBody = value ?? {};
    else if (name === '$query') Object.assign(query, value || {});
    else if (path.includes(`:${name}`)) path = path.replace(`:${name}`, encodeURIComponent(value));
    else if (bodyMethod) body[name] = value;
    else query[name] = value;
  });
  return { path, query, body: bodyMethod ? (wholeBody ?? body) : undefined };
}

function endpoint(name) {
  const spec = routes[name];
  if (spec.multipart) {
    // Uploads send the file itself (not JSON).
    return async (file) => {
      const form = new FormData();
      form.append('file', file, file.name);
      return request('POST', spec.path, { form });
    };
  }
  return async (...args) => {
    const { path, query, body } = build(spec, args);
    return request(spec.method, path, { query, body });
  };
}

function createHttpApi() {
  const api = {};
  Object.keys(routes).forEach((name) => {
    const [area, fn] = splitName(name);
    if (area) { api[area] = api[area] || {}; api[area][fn] = endpoint(name); } else api[fn] = endpoint(name);
  });
  // Signing out always forgets this tab's token, even if the request fails (the server expires it anyway).
  const logout = api.auth.logout;
  api.auth.logout = async () => {
    try {
      return await logout();
    } finally {
      setSessionToken(null);
    }
  };
  // A token the server no longer accepts shows up as "nobody signed in" on the bootstrap call: drop it.
  const bootstrap = api.bootstrap;
  api.bootstrap = async (...args) => {
    const sent = getSessionToken();
    const snapshot = await bootstrap(...args);
    // Only if that same token is still this tab's: a sign-in that finished meanwhile must not be undone.
    if (!snapshot?.me && sent && getSessionToken() === sent) setSessionToken(null);
    return snapshot;
  };
  return api;
}

export const httpApi = createHttpApi();
