/**
 * Which implementation the tests drive:
 *   - default                      : the in-process services (`local.js`)
 *   - TASKIT_API_URL=http://.../api : the REAL HTTP client, so every call goes over the network to the Express server
 * The assertions are identical either way, which is what proves the two are interchangeable.
 */
import { localApi } from '../local.js';

export const api = process.env.TASKIT_API_URL ? (await import('../http.js')).httpApi : localApi;
