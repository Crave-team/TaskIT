# TaskIT server (Node.js · Express · Mongoose)

A thin HTTP layer over the framework-free services in `../src/api`. **No business logic lives here**: permissions,
validation, cascades and notifications are all in the services, which are the same code the browser demo runs.

```
browser ── src/api/http.js ──HTTP──► Express (this folder) ──► src/api/services ──► repository ──► MongoDB
                  ▲                         │                       (rules)          (mongoRepo.js)
          shared route table  ◄─────────────┘
          src/api/routes.js
```

## Run it

```bash
# 1. build the front end in "server mode" (the app then talks to /api instead of running in-memory)
npm install && VITE_API_URL=/api npm run build

# 2. start the server (serves the built app AND the API on one origin)
cd server && npm install
cp .env.example .env     # set MONGODB_URI and ADMIN_INVITE_CODE
node --env-file=.env src/index.js
```
Development (set `NODE_ENV=development` and `COOKIE_SECURE=false` in `.env`): run `npm run dev` here (it loads `.env`), and `VITE_API_URL=/api npm run dev` at the project root (Vite proxies `/api` to port 3000).
The first admin registers from the footer's **Admin** link using `ADMIN_INVITE_CODE`.

### Email codes: password + a 6-digit code (on by default)
After the password, TaskIT emails a 6-digit code, for sign-in and for sign-up (so nobody can register an address they cannot read).
1. **Development, nothing to set up:** with `NODE_ENV=development` and no `SMTP_*` in `.env`, the code is **printed in the server window**
   (look for `[mail:dev]`). Type that code in the browser.
2. **Real emails through Gmail** (free, about 500 a day): turn on 2-Step Verification for the Gmail account, create an *App password* at
   `myaccount.google.com/apppasswords`, then set in `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=yourname@gmail.com
   SMTP_PASS=the-16-letter-app-password
   MAIL_FROM=TaskIT <yourname@gmail.com>
   ```
3. `EMAIL_CODE_REQUIRED=false` makes it optional (each person can turn it on in Settings). In production the server **refuses to start**
   while codes are required but SMTP is not configured, so it can never silently run without them.
   **Admin accounts** follow the **System Settings → Require 2FA for admins** switch instead of `EMAIL_CODE_REQUIRED`: off means admins sign in
   with their password alone (unless they turned on their own code in Settings), on means every admin sign-in asks for a code. The switch can
   only be turned on while SMTP is configured, so it can never lock the admins out.
Run `npm run test:emailcode` (no database or mail account needed) for the senders and the HTTP behaviour.

### Sign in with Google (optional)
Members and admins can use "Continue with Google" next to the password form. To turn it on:
1. Google Cloud Console -> *APIs & Services* -> *Credentials* -> *Create credentials* -> *OAuth client ID* -> **Web application**.
2. Under *Authorized JavaScript origins* add every origin the app is opened from (e.g. `https://app.example.com`, and `http://localhost:5173` in development). No redirect URI is needed.
3. Put the client id in `.env` as `GOOGLE_CLIENT_ID=...` and restart. Leave it empty to hide the button. (The id is public, so the front end needs no extra setting: it asks `GET /api/auth/google/config`.)

The server verifies every Google token itself (`src/http/google.js`, using `google-auth-library`); the browser's claim is never trusted. Admin accounts created this way still need `ADMIN_INVITE_CODE`, and Google sign-in can never turn a member into an admin.
Run `npm run test:google`, `npm run test:auth` and `npm run test:emailcode` (no database, Google or mail account needed) for the verifier, the HTTP checks, and a sweep proving every protected route needs a sign-in.

## What is in here
| File | Purpose |
|---|---|
| `src/db/models.js` | Mongoose schemas + indexes (`strict: 'throw'`: unknown fields are errors, not silent loss) |
| `src/db/mongoRepo.js` | The Mongo implementation of the repository interface (`../src/api/repo.js`) |
| `src/db/sessionStore.js` | Sessions in MongoDB: random token sent as `Authorization: Bearer` (kept in the browser tab's sessionStorage), only its SHA-256 stored, idle + absolute expiry |
| `src/db/diskStorage.js` | Uploaded files on disk under their id (swap for S3/GridFS by implementing the same 3 methods) |
| `src/http/app.js` | Express app: one route per row of the shared route table, login/logout/Google sign-in, upload/download, static files |
| `src/http/google.js` | Google ID-token verifier (signature, issuer, expiry, audience) plugged into the services |
| `src/http/security.js` | CSRF header, NoSQL-operator rejection, CORS |
| `src/http/errors.js` | Every failure becomes `{ error: { status, code, message, field } }`; no stack traces leak |

## Security measures
helmet (CSP, nosniff, frame-ancestors none) · per-tab Bearer session token (no cookie, so two accounts can be signed in side by side in one browser) ·
`X-Requested-With` required on writes (CSRF) · rejection of `$`/`.` keys in input (NoSQL injection) · rate limiting on
sign-in/registration/password routes and a global limit · 100 kB JSON limit, 10 MB uploads · uploads stored under their
id, name sanitised, served with `nosniff`, sandbox CSP and forced download (except plain images), only to people allowed
to see what they are attached to · only files you uploaded can be attached · production refuses the default admin code.

## Tests
```bash
cd server
npm run test:mongo   # the 30 service tests, directly on MongoDB
npm run test:http    # the same tests + HTTP-layer tests, through Express and the real HTTP client
```
Both need a MongoDB-compatible server at `MONGODB_URI` (default `mongodb://127.0.0.1:27017/taskit_test`; the database is
wiped between tests, so use a dedicated one). `MONGO_SKIP_TTL=true` and `TEST_DB_ATOMIC=false` exist ONLY for servers
that lack TTL indexes / atomic concurrent updates (FerretDB); with real MongoDB or Atlas leave them unset and the
concurrency tests run too. The in-memory suite (`npm run test:api` at the project root) needs no database.
