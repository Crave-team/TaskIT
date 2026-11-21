# TaskIT API contract (Node.js · Express · MongoDB)

The contract is **code, not prose**: `src/api/routes.js` is one table (79 routes) that the Express server turns into
routes and the browser client (`src/api/http.js`) turns into `fetch` calls. Each row names the service function it
calls, its HTTP method and path, and where each argument travels (URL parameter, JSON body, or query string).
Read that file for the exact list; this page explains the conventions.

## Request / response
- Base path `/api`. JSON in, JSON out. Success: `{ "data": <result> }`. Failure: `{ "error": { "status", "code", "message", "field"? } }`.
- Common codes: `BAD_REQUEST` 400 · `UNAUTHORIZED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 · `TOO_LARGE` 413 · `RATE_LIMITED` 429.
  Sign-in failures use `NO_ACCOUNT`, `BAD_PASSWORD`, `SUSPENDED`, `WRONG_PORTAL`; Google sign-in adds `USE_GOOGLE`, `BAD_GOOGLE_TOKEN`,
  `EMAIL_NOT_VERIFIED`, `GOOGLE_MISMATCH`, `GOOGLE_UNAVAILABLE`; email codes add `BAD_CODE`, `CODE_EXPIRED`, `CODE_LOCKED`,
  `CODE_TOO_SOON`, `TOO_MANY_CODES`, `EMAIL_SEND_FAILED`, `EMAIL_CODE_UNAVAILABLE`.
- **Auth**: sign-in (`/auth/login`, `/auth/google`, the final email-code step) answers `{ data: <user>, sessionToken }` with
  `Cache-Control: no-store`. The client keeps the token in that **tab's `sessionStorage`** and sends `Authorization: Bearer <token>`
  on every request; there is no session cookie (a cookie is shared by all tabs, so a second sign-in in another tab used to change
  who the first tab was). Closing the tab ends the sign-in; reloading keeps it. Uploaded files (`GET /files/:id/content`) need the
  same header, so the app fetches them with `fetch` and shows a `blob:` URL (`src/api/protectedUrl.js`); those responses carry
  `Vary: Authorization`. Every write must send `X-Requested-With: taskit`.
- **Forgot password**: `POST /auth/forgot { email }` emails a 6-digit code and answers `{ codeRequired, challengeToken, email (masked), resendIn, expiresIn }`
  (the same shape for an address with no account, so it cannot be used to find out who is registered; `503 EMAIL_CODE_UNAVAILABLE` when the
  server has no mail account). `POST /auth/forgot/verify { challengeToken, code, newPassword }` checks the code (single use, 5 tries), sets the
  new password and signs the account out everywhere; it answers `{ reset: true }` and does NOT sign anyone in. `POST /auth/code/resend` also
  works for these challenges. A reset code can never be used at `/auth/code/verify`, and a sign-in code can never be used here. `GET /bootstrap` is public and returns `{ me: null }` when nobody is signed in.
- **Authentication on every route.** Only nine entries of the table are public: `auth.register`, `auth.login`, `auth.loginWithGoogle`,
  `auth.getGoogleConfig`, `auth.requestPasswordReset`, the three email-code routes below, and `bootstrap` (which answers "nobody" when signed out). Every other route answers
  **401** to a request with no session or a forged token, **before** it looks anything up or reads an upload, and the `/admin/*` routes
  answer **403** to members. Signing in with a password or with Google creates the same server-side session, so both get exactly the same
  access. `server/test/auth-coverage.test.mjs` (`npm run test:auth`, no database needed) calls every route to prove this and fails if a
  new route is left public by accident.
- **Email codes (2-step sign-in).** When the server requires them (`EMAIL_CODE_REQUIRED`, on by default) or a person turned on
  two-step sign-in in Settings, a correct password is NOT enough:
  - `POST /auth/login` answers `{ codeRequired: true, challengeToken, email: "m***@gmail.com", resendIn, expiresIn }` and sets **no cookie**;
    a 6-digit code is emailed. `POST /auth/register` does the same and creates **no account yet**.
  - `POST /auth/code/verify` `{ challengeToken, code }` finishes it: the account is created (sign-up) and the response carries the `sessionToken`.
    It needs BOTH halves: the token (only someone who passed the password step has it) and the code (only the mailbox owner has it).
  - `POST /auth/code/resend` `{ challengeToken }` emails a fresh code (the old one stops working). `GET /auth/code/config` ->
    `{ required, available }` for the forms and Settings.
  - Codes are random, work once, expire after 10 minutes, allow 5 wrong tries, resend only 60 s apart (5 per attempt), and at most
    10 attempts per address per hour. Only SHA-256 hashes of token and code are stored. If a code is needed but mail cannot be
    sent, the answer is 503/502 and nobody is let in (it fails closed). Google sign-in has its own verified route and skips the code.
- **Google sign-in** (members and admins; off unless the server has `GOOGLE_CLIENT_ID`):
  - `GET /auth/google/config` (public) -> `{ enabled, clientId }`; the browser shows the button only when `enabled`.
  - `POST /auth/google` `{ credential, expectedRole: 'user'|'admin', inviteCode? }` -> the account, and returns the same `sessionToken` as
    `/auth/login`. `credential` is the ID token Google's button returns; the **server verifies it** (signature, issuer, expiry, audience =
    our client id) and trusts only that verified identity. First use creates the account. `expectedRole` is the Member / Admin tab: it must
    match the account (`WRONG_PORTAL`), so nobody is ever promoted this way; a NEW admin account needs `inviteCode`, and the admin tab
    with no account and no code answers `NO_ACCOUNT`. Accounts match by Google's `sub`, then by verified email; an email tied to a different
    Google account is refused (`GOOGLE_MISMATCH`). Linking an existing *password* account switches its password off (sign-up does not verify
    email, so the old password may not be the owner's) and ends its other sessions; the person can set a new one (`POST /me/password`
    without `current`, allowed only while the account has no password). `GET /me` shows `hasPassword` / `googleLinked`.
- **Files**: `POST /files` (multipart, field `file`, 10 MB) returns a file record; reference it by `fileId` when attaching.
  `GET /files/:id/content` is permission-checked (404 if you may not see it) and served with `nosniff` + sandbox CSP;
  only plain images display inline, everything else downloads.
- **Paging**: list endpoints take `limit` and `before` (an id cursor: the id of the oldest item you already have).
- Input is rejected (400) if any key starts with `$` or contains `.` (NoSQL operator injection).

## Collections and indexes (`server/src/db/models.js`)
`users` (unique lower-cased `email`; unique `googleId` when present, `passwordHash` null for Google-only accounts) · `groups` (unique `inviteCode`, index `memberIds`) · `joinRequests` (unique
`{groupId, accountId}`) · `messages` (`{groupId, _id:-1}`) · `teamAnnouncements` · `projects` · `tasks` (`ownerId`,
`groupId`, `assigneeId`, `projectId`, `dueDate`, `attachments.fileId`, `turnIn.files.fileId`) · `reminders`
(`{ownerId, date}`) · `notifications` (unique sparse `dedupeId`; `{recipientId, _id:-1}`) · `activity` · `files` ·
`sessions` (SHA-256 of the token as `_id`; TTL index on `expiresAt`) · `settings` (single document).
`_id` values are the 24-hex strings the data layer generates (ordered by creation, ObjectId-shaped); every reference
is the same kind of string.

## Design rules the services follow
1. **Who is asking** comes only from the session (`ctx.actorId`), never from the request body.
2. **Permissions live in the services**, not the UI.
3. **People are IDs**; display names are looked up when a response is built, so renaming needs no data rewrite.
4. **Embedded lists** (subtasks, comments, history, time entries, members...) change with atomic operators
   (`$push`, `$pull`/`$pullAll`, `$addToSet`, positional/indexed `$set`), never by rewriting the array.
5. **Cascades** (delete user / team / project) run inside `transaction()`: a MongoDB transaction when
   `MONGO_TRANSACTIONS=true` (needs a replica set), otherwise ordered so a half-finished run can be repeated.
6. **Uniqueness races** (same email, double-click "request to join", duplicate notices) are decided by unique indexes
   and the resulting duplicate-key error is turned into a normal response.
