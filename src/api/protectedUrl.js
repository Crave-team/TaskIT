import { getSessionToken, onSessionChange } from './clientSession.js';

/**
 * Uploaded files are served by the API (`/api/files/:id/content`) and only to people allowed to see them. A browser
 * cannot attach an `Authorization` header to `<img src>`, `<iframe src>` or a plain download link, so those URLs are
 * fetched here WITH the header and handed to the page as a temporary `blob:` URL instead.
 *
 * Anything that is not an API URL (the demo's `blob:` URLs, `data:` images) is returned untouched, and the token is
 * never sent anywhere but our own `/api/` paths.
 */
const API_PREFIX = '/api/';
const cache = new Map(); // api url -> Promise<blob url>, so a photo shown 20 times is fetched once

export const needsAuth = (url) => typeof url === 'string' && url.startsWith(API_PREFIX);

/** Forget everything fetched for the previous account (also frees the memory behind those blob URLs). */
function clearCache() {
  for (const pending of cache.values()) pending.then((href) => URL.revokeObjectURL(href), () => {});
  cache.clear();
}
onSessionChange(clearCache);

async function fetchBlob(url) {
  const token = getSessionToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'omit' });
  if (!res.ok) throw new Error(res.status === 404 ? 'That file is no longer available.' : 'Could not load that file.');
  return res.blob();
}

/** The text of a stored file (for the preview). API files are read straight from the response, not via a blob: URL. */
export async function readFileText(url) {
  if (needsAuth(url)) return (await fetchBlob(url)).text();
  return (await fetch(url)).text();
}

/** A URL the page can use directly in `src` / `href` / `fetch`. Rejects if the file cannot be loaded. */
export function resolveFileUrl(url) {
  if (!needsAuth(url)) return Promise.resolve(url);
  if (!cache.has(url)) {
    const pending = fetchBlob(url).then((blob) => URL.createObjectURL(blob));
    cache.set(url, pending);
    // A failure must not be cached, or the file could never load again until the next sign-in.
    pending.catch(() => { if (cache.get(url) === pending) cache.delete(url); });
  }
  return cache.get(url);
}
