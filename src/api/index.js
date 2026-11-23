/**
 * The data layer the UI talks to: `api.<area>.<operation>(...)`, always async, always JSON.
 *
 * Which implementation runs is decided when the app is BUILT (a compile-time constant, so the other one is
 * dropped from the bundle entirely):
 *   - `VITE_API_URL` set (e.g. `/api`)  -> `http.js`: requests to the Express + MongoDB server;
 *   - not set                           -> `local.js`: the same services running in the browser against an
 *                                          in-memory repository (the demo).
 * (Node tests import `local.js` / `http.js` directly, see `__tests__/api.mjs`.)
 */
export const api = import.meta.env.VITE_API_URL
  ? (await import('./http.js')).httpApi
  : (await import('./local.js')).localApi;

/** True when the app talks to the server (other people's changes can arrive); false for the single-tab in-browser demo. */
export const isRemoteApi = Boolean(import.meta.env.VITE_API_URL);

/** Where the server streams "something changed" messages (null in the demo). */
export const liveStreamUrl = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/live` : null;

export { ApiError } from './errors.js';
