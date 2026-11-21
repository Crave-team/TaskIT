# System test report

**Scope:** every page, every `api.*` function (73), every role (visitor, member, team admin, site admin).

| Layer | Result |
|---|---|
| Service tests (`npm run test:api`, plain Node) | 26 tests, all pass; all 73 API functions exercised (a guard test fails if one is ever left untested) |
| Browser: public pages + auth | 39/39 |
| Browser: workspace (projects, tasks, Kanban, list, filters, files, time) | 43/43 |
| Browser: dashboard, tour, notifications, search, settings | 38/38 |
| Browser: calendar | 26/26 |
| Browser: teams (create/join/roles/assign/turn-in/chat/reports/leave/disband) | 60/60 (stable over 3 runs) |
| Browser: site admin | 37/37 |
| Browser: phone + tablet layouts, dark mode | 49/50 |
| Browser: robustness (script injection, double submit, long/unicode input) | 13/13 |
| **Total browser checks** | **305 / 306** |

## Bugs found by this audit and fixed
1. Pagination skipped/mis-ordered records created in the same millisecond (chat, activity). IDs are now
   monotonic ObjectId-style values and cursors use the id.
2. A member's "Recent activity" could come back empty after enough page visits (visits were filtered after paging).

## Open items (none blocks starting the database work)
- Cosmetic: on a 390px phone the homepage scrolls sideways by 8px (the three "One calm workspace / Built for teams /
  You stay in control" cards).
- Stored but inert: task **Repeat** (never creates the next occurrence); task **dependencies** (`dependsOn`, no UI, but
  advertised on the homepage); **2FA** (per-user and site-wide switches are saved, not enforced); **Daily digest**
  (was disabled, "Coming soon", when this report was written; it is now a working feature); password reset (no email).
- Advertised on the homepage but not built: **project members**; adding an **announcement** from the calendar.
- Dead code: legacy sample arrays in `src/data/mockData.js` are no longer used.

## Not testable until a real backend exists
Deep-link-then-login (`next=`), multi-tab / multi-device behaviour, real-time chat, email, real file storage,
concurrent edits, load. Browsers tested: Chromium only.
