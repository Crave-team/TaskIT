# Backend report: Express + Mongoose

## What was built
- `src/api/` services are now **async** and talk to a **repository interface** with two implementations: in-memory
  (the browser demo, fast tests) and Mongoose (`server/src/db/mongoRepo.js`). Sessions and file storage are pluggable the same way.
- `server/`: Express 5 app (helmet CSP, cookie sessions stored hashed in MongoDB, CSRF header, NoSQL-operator rejection,
  rate limiting, authenticated and sandboxed file downloads, uniform JSON errors) generated from the shared route table.
- The browser app has two builds: `npm run build` (in-memory demo) and `npm run build:server` (talks to `/api`;
  the services are not in that bundle).

## Verification (what was actually run)
| Check | Result |
|---|---|
| 30 service tests, in-memory | 29 pass, 1 skipped (needs real unique indexes) |
| Same 30 tests on Mongoose | 27 pass, 3 skipped* |
| Same 30 tests **through HTTP** (browser client -> Express -> Mongoose) + 12 HTTP-layer tests (cookies, CSRF, injection, uploads, sessions, rate limit) | 39 pass, 3 skipped* |
| Browser suite against the real stack (306 checks, 8 scenarios) | 306 / 306 |
| Persistence: reload keeps you signed in; full server restart keeps session, data, file bytes | pass |
| Browser suite against the in-memory demo build (re-run after the changes) | pass |

## Bugs found by running on a real database / real HTTP (all fixed)
1. Team ownership transfer pulled and added the same array field in one update: MongoDB rejects that, memory allowed it.
2. `register` / `requestPasswordReset` take no caller, but the generic route handler passed one.
3. **Double-clicking "Create task" made two tasks** once saving took network time. Forms now disable while saving and
   only close on success (so a server refusal no longer loses what you typed).
4. **Reloading the page signed you out** (the route guard judged "signed in?" before the server had answered). Added a loading state.
5. Attachments / chat photos accepted any file id (one user could attach, then download, another user's file). Now only files you uploaded.
6. Profile preferences/avatar URL were taken from the client unchecked; now whitelisted and server-derived.
7. Session tokens were drawn from the ordered-id generator (too predictable); now cryptographic random.
8. Pagination and "recent activity" defects (same-millisecond ordering, page visits crowding out real activity).

## What is NOT verified (be aware)
- *The only MongoDB-compatible server available in the build environment was **FerretDB** (SQLite backend), not MongoDB.*
  It lacks TTL indexes and **does not make concurrent single-document updates atomic** (even a bare `$inc` lost writes).
  Therefore 3 tests (concurrent edits, concurrent approvals, concurrent reactions) were skipped there. They pass in memory,
  and the repository uses the standard atomic operators that MongoDB guarantees, but **run `npm test` in `server/` against
  real MongoDB / Atlas (leave `TEST_DB_ATOMIC` and `MONGO_SKIP_TTL` unset) before relying on it.**
- Multi-document transactions (`MONGO_TRANSACTIONS=true`) need a replica set and were not exercised.
- Not load-tested; HTTPS/Secure-cookie behaviour only checked by configuration, not behind a real proxy; Chromium only.
- Still inert from before: task Repeat, dependencies, 2FA enforcement, real email for password reset. (The **daily digest** that used to be listed here is now a working feature; see README.)
- Over a network the UI feels a little slower for tiny actions (tick a subtask, drag a card): updates are not optimistic yet.
