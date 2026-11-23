import { forbidden, badRequest } from '../../../src/api/errors.js';

/** True if a JSON value contains a key MongoDB would treat as an operator (`$ne`) or a path (`a.b`). */
function hasOperatorKeys(value, depth = 0) {
  if (depth > 8) return true; // absurdly deep input
  if (Array.isArray(value)) return value.some((v) => hasOperatorKeys(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => k.startsWith('$') || k.includes('.') || hasOperatorKeys(v, depth + 1));
  }
  return false;
}

/**
 * NoSQL-injection guard: reject any request whose body, query or URL parameters contain operator-looking
 * keys. (A client sending `{"email": {"$ne": null}}` must never reach a database filter.)
 */
export function rejectOperatorKeys(req, _res, next) {
  if (hasOperatorKeys(req.body) || hasOperatorKeys(req.query) || hasOperatorKeys(req.params)) {
    return next(badRequest('Invalid request.'));
  }
  return next();
}

/**
 * CSRF defence: every write must carry a custom header. Browsers will not add custom headers to cross-site form
 * posts, and a cross-origin script needs CORS permission to send one. (Sessions travel in an `Authorization` header
 * rather than a cookie, so a forged cross-site request has no credentials to ride on in the first place.)
 */
export function requireCustomHeader(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'taskit') return next(forbidden('Missing request header.'));
  return next();
}

/** Minimal CORS, only when the browser app is served from a different origin than this server. */
export function cors(origin) {
  return (req, res, next) => {
    if (origin && req.get('origin') === origin) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        Vary: 'Origin',
      });
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    return next();
  };
}
