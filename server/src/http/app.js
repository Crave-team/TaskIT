import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';

import { routes, splitName } from '../../../src/api/routes.js';
import { config as apiConfig } from '../../../src/api/config.js';
import { userIdForToken } from '../../../src/api/session.js';
import { storage } from '../../../src/api/storage.js';
import { resetDatabase } from '../../../src/api/repo.js';
import { ApiError } from '../../../src/api/errors.js';
import { requireActor } from '../../../src/api/core.js';
import * as authService from '../../../src/api/services/authService.js';
import * as taskService from '../../../src/api/services/taskService.js';
import * as teamService from '../../../src/api/services/teamService.js';
import * as notificationService from '../../../src/api/services/notificationService.js';
import * as activityService from '../../../src/api/services/activityService.js';
import * as fileService from '../../../src/api/services/fileService.js';
import { bootstrap } from '../../../src/api/services/syncService.js';

import { errorHandler } from './errors.js';
import { rejectOperatorKeys, requireCustomHeader, cors } from './security.js';
import { createLiveHub, liveRoute } from './live.js';

/** The same services the browser demo runs in-process, now reached over HTTP. */
const areas = { auth: authService, tasks: taskService, teams: teamService, notifications: notificationService, activity: activityService, files: fileService };
const functionFor = (name) => {
  const [area, fn] = splitName(name);
  return area ? areas[area][fn] : bootstrap;
};

/** Where each service argument comes from in the HTTP request (mirror image of `http.js` on the client). */
function argsFor(spec, req) {
  const bodyMethod = ['POST', 'PUT', 'PATCH'].includes(spec.method);
  return spec.args.map((name) => {
    if (name === '$body') return req.body ?? {};
    if (name === '$query') return { ...req.query };
    if (spec.path.includes(`:${name}`)) return req.params[name];
    return bodyMethod ? req.body?.[name] : req.query[name];
  });
}

/** The session token from `Authorization: Bearer <token>`, or undefined. (Length limits mirror the session store.) */
const bearerToken = (req) => /^Bearer\s+(\S{32,200})$/i.exec(req.get('authorization') || '')?.[1];

const SAFE_INLINE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function createApp({ config, logger = console }) {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  // Google's sign-in button loads a script and an iframe from accounts.google.com. Those exceptions (and the popup-friendly
  // opener policy it needs) are added ONLY when Google sign-in is configured, so the default stays as strict as possible.
  const googleOn = Boolean(config.googleClientId);
  const GSI = 'https://accounts.google.com/gsi/';
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...(googleOn ? [`${GSI}client`] : [])],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', ...(googleOn ? [`${GSI}style`] : [])],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", ...(googleOn ? [GSI] : [])],
        // blob: lets the PDF preview show a file the page fetched with the session header (see protectedUrl.js).
        frameSrc: ["'self'", ...(googleOn ? [GSI] : []), 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    // Google's popup talks back to this page; a strict `same-origin` policy would cut that link.
    crossOriginOpenerPolicy: { policy: googleOn ? 'same-origin-allow-popups' : 'same-origin' },
  }));
  app.use(cors(config.clientOrigin));
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.use(rejectOperatorKeys);
  api.use(requireCustomHeader);

  // Who is asking: resolved from the `Authorization: Bearer <session token>` header ONLY, never from anything the client
  // sends in the body. There is deliberately no cookie: a cookie is shared by every tab of a browser, so a second sign-in
  // in another tab would silently change who the first tab is.
  api.use(async (req, _res, next) => {
    const token = bearerToken(req);
    req.sessionToken = token;
    req.ctx = { actorId: await userIdForToken(token) };
    next();
  });

  const authLimiter = config.rateLimit
    ? rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: { status: 429, code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' } } })
    : (_req, _res, next) => next();
  const apiLimiter = config.rateLimit
    ? rateLimit({ windowMs: 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { error: { status: 429, code: 'RATE_LIMITED', message: 'Too many requests. Slow down a little.' } } })
    : (_req, _res, next) => next();
  api.use(apiLimiter);

  // Live updates: every successful write tells the open tabs (over `GET /live`) to re-fetch. The tab that made the
  // write is skipped; it refreshes itself.
  const liveHub = createLiveHub();
  app.locals.liveHub = liveHub;
  api.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      res.on('finish', () => { if (res.statusCode < 400) liveHub.notifyChanged({ token: req.sessionToken }); });
    }
    next();
  });

  // Earlier versions kept the session in a shared cookie. It is no longer read; sign-in and sign-out remove any copy a
  // browser still holds so a stale-but-valid token does not linger there.
  const retireLegacyCookie = (res) => res.clearCookie(config.cookieName, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' });
  const ok = (res, data) => res.json({ data: data === undefined ? null : data });

  api.get('/health', (_req, res) => res.json({ data: { status: 'ok' } }));
  api.get('/live', liveRoute({
    hub: liveHub,
    authenticate: (req) => requireActor(req.ctx),
    isSessionValid: (token) => userIdForToken(token),
  }));

  // ---- sign in hands the token to this tab; sign out ends it (the services only deal with the token) -----
  const startSession = (signIn) => async (req, res) => {
    const result = await signIn(req.body ?? {});
    // A correct password that still needs its emailed code starts NO session: the browser only gets the challenge.
    if (result.codeRequired) return ok(res, result);
    retireLegacyCookie(res);
    // The token travels in the response BODY, once, to this tab's sessionStorage. Never cache a response that carries it.
    res.set('Cache-Control', 'no-store');
    res.json({ data: result.user, sessionToken: result.token });
  };
  api.post('/auth/login', authLimiter, startSession(authService.login));
  api.post('/auth/google', authLimiter, startSession(authService.loginWithGoogle));
  api.post('/auth/code/verify', authLimiter, startSession(authService.verifyEmailCode));
  api.post('/auth/logout', async (req, res) => {
    await authService.logout(req.ctx, req.sessionToken);
    retireLegacyCookie(res);
    ok(res, null);
  });

  // ---- files: upload (multipart) and an authenticated download -----------------------------------------
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: apiConfig.MAX_FILE_BYTES, files: 1, fields: 0 } });
  // Sign-in is checked BEFORE the upload is read: an anonymous caller must not be able to make the server buffer a file.
  const signedIn = async (req, _res, next) => {
    try { await requireActor(req.ctx); next(); } catch (e) { next(e); }
  };
  api.post('/files', signedIn, upload.single('file'), async (req, res) => {
    if (!req.file) throw new ApiError(400, 'BAD_REQUEST', 'No file was provided.');
    const { originalname, size, mimetype, buffer } = req.file;
    ok(res, await fileService.uploadFile(req.ctx, { name: originalname, size, type: mimetype, buffer }));
  });
  api.get('/files/:id/content', async (req, res) => {
    const file = await fileService.getFileForDownload(req.ctx, req.params.id);
    const stream = storage.read(file);
    stream.on('error', () => { if (!res.headersSent) res.status(404).json({ error: { status: 404, code: 'NOT_FOUND', message: 'File not found.' } }); });
    const inline = SAFE_INLINE.has(file.mime);
    res.set({
      'Content-Type': inline ? file.mime : 'application/octet-stream',
      // Only plain images display in the page; everything else downloads, so an uploaded HTML/SVG can never run as our site.
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=300',
      // Cache entries are per session token: without this a browser shared by two accounts could hand one account's
      // file to the other from its HTTP cache without asking the server.
      Vary: 'Authorization',
    });
    stream.pipe(res);
  });

  // ---- everything else: one route per row of the shared table ------------------------------------------
  for (const [name, spec] of Object.entries(routes)) {
    if (['auth.login', 'auth.loginWithGoogle', 'auth.verifyEmailCode', 'auth.logout', 'files.uploadFile'].includes(name)) continue; // handled above
    const fn = functionFor(name);
    const handlers = [];
    if (spec.limit === 'auth') handlers.push(authLimiter);
    handlers.push(async (req, res) => ok(res, await (spec.noCtx ? fn(...argsFor(spec, req)) : fn(req.ctx, ...argsFor(spec, req)))));
    api[spec.method.toLowerCase()](spec.path, ...handlers);
  }

  if (config.isTest) {
    // Test-only: wipe the database between browser-test scenarios. Never mounted outside NODE_ENV=test.
    api.post('/test/reset', async (_req, res) => { await resetDatabase(); ok(res, null); });
  }

  api.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Not found.')));
  app.use('/api', api);

  // ---- the built front end (single-page app) ------------------------------------------------------------
  if (fs.existsSync(path.join(config.staticDir, 'index.html'))) {
    app.use(express.static(config.staticDir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api')
      ? res.sendFile(path.join(config.staticDir, 'index.html'))
      : next()));
  }

  app.use(errorHandler(logger));
  return app;
}
