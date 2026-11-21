# Browser test suite (Playwright, Python)

Eight scenarios, ~300 checks, covering every page and feature: public pages and auth, workspace
(projects, Kanban, list, filters, task tabs), dashboard/tour/notifications/search/settings, calendar,
teams (join, roles, assign, turn-in/approve, chat, reports), admin, responsive + dark mode, robustness.

Run: see the header of `run_all.sh`. `s6_google_auth.py` (Google sign-in) and `s7_email_code.py` (password + emailed 6-digit code) are not in `run_all.sh`: each needs its own throw-away server (fake Google verifier / code-required server with a mail log), see their headers. Each check prints `PASS`/`FAIL`; failures save a screenshot in `shots/`.
Note: the app currently keeps data in memory, so scenarios create their own accounts. Once the MongoDB
backend exists, point `BASE` in `h.py` at it and clear the database between scenarios.

- `s10_two_tabs.py` — two accounts in one browser, one per tab (needs `server/test/e2e-tabs-server.mjs`; see the file header).

- `s11_refresh_keeps_page.py` — refresh keeps the page (open team, team tab, project); an open window is dropped.
- `s12_auth_popup_refresh.py` — the log-in / sign-up popups (member and admin) survive a refresh; closing removes them.
- `s13_input_survives_refresh.py` — typed input and open windows survive a refresh (passwords never do); nothing carries over to the next login.
- `s14_password_reset.py` — forgot password with an emailed code and a new password (records the "emails" in a file).
- `s15_dev_refresh.py` — refresh in `npm run dev` with a slow database keeps you signed in on the same page (needs the two-server setup in its header).
- `s16_overdue_toggle.py` — the admin overdue-alerts switch responds at once, saves, and silences the pop-up.
- `s17_member_alerts_toggle.py` — the member's Settings → "Due-date reminders" switch moves at once, locks while saving, is saved, and OFF silences the overdue pop-up too.
- `s18_load_failure.py` — a refresh while the server answers 503 keeps the session and shows "Try again" (never the log-in popup).
- `s19_roles_visibility_live.py` — three browser tabs at once (owner, member, site admin) against the real stack: the team-card Public/Private switch, company roles set by the admin, role-tag auto-assignment (incl. "no one has the role" -> left unassigned), and live updates (a change in one tab appears in the others with no reload, in well under the 5 s fallback timer). `E2E_NO_LIVE=1` blocks the push stream to check that the timer fallback still works. Run it with `./e2e/run_against_server.sh`-style setup (real server + MongoDB).
- `s21_allocation_accuracy.py` — the accurate auto-allocation through the UI on the real stack: skill levels set on the Users page, the Priority picker and live role preview, role read from a tag or the title, big tasks going to the senior, tie-break, hand-picked work counting as workload, unassigned when nobody has a tagged role, and the server refusing non-admins and faked "auto" claims.
- `s20_daily_digest.py` — the Daily digest on the real stack: the Settings switch (on by default), the once-a-day summary in the bell with exact counts, off/on without duplicates, other people's tasks not counted, and the admin's site-wide alerts switch. Mirrors scenario 14 of `docs/MANUAL_TEST_SCENARIOS.md`.
