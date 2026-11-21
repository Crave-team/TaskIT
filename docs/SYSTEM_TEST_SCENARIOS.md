# System test scenarios and results

**Run date:** 2026-11-11  
**Version tested:** v56 (this zip).  
**Stack:** real browser (Chromium, Playwright) → Express server → MongoDB 8 (a throw-away local database), built with `VITE_API_URL=/api`. Nothing is mocked.

This file lists **every scenario and every individual check** that was run, with its result from that run. Anything that failed or could not run is explained in section 4. For things to try by hand, see `MANUAL_TEST_SCENARIOS.md`.

## 1. Summary

| Layer | What it covers | Result |
|---|---|---|
| Browser system tests (section 3) | every page and feature, three roles, phone/tablet/dark mode, restart persistence, the new features | **386 of 386 checks passed** (+ 5 persistence checks after a full server restart, all passed). Nothing failed and no script stopped early |
| Browser, new scenario with the live stream blocked | the 5-second fallback | 33 of 33 passed |
| Integration: services → MongoDB (`npm run test:mongo`) | real unique indexes, concurrency, persistence | 88 pass, 0 skipped (standalone **and** replica set with transactions) |
| Integration: client → Express → MongoDB (`npm run test:http`) | the whole HTTP layer | 99 pass, 1 skipped (a profile-photo check the suite skips itself), in both modes |
| Server live-updates tests (`npm run test:live` in `server/`) | push hub and `/api/live` on the real app | 8 pass |
| Other server tests without a database (`test:auth`, `test:google`, `test:emailcode`) | auth coverage, Google, emailed code | 13 + 8 + 10 pass |
| App unit/service tests (`npm run test:api`) | services, allocation rules, live poller, stream reader | 127 pass, 2 skipped (they need MongoDB and pass in `test:mongo`) |
| Lint / builds | `oxlint`, demo build, server-mode build | 0 errors (34 warnings, same as v47); both builds succeed |

## 2. How to run these yourself

```powershell
# build the website for the server
$env:VITE_API_URL = "/api"; npm run build
```
```bash
# Git Bash / WSL: whole browser suite against the real stack (wipes the database between scenarios)
MONGODB_URI=mongodb://127.0.0.1:27017/taskit_e2e ./e2e/run_against_server.sh
# the new scenario alone (server already running on :4173 with E2E_RESET=1)
python e2e/s19_roles_visibility_live.py
# same with the push stream blocked, to test the 5-second fallback
E2E_NO_LIVE=1 python e2e/s19_roles_visibility_live.py
```
Needs `pip install playwright` and `playwright install chromium`. **Use a disposable database.**

## 3. Browser scenarios and every check

### Scenario 1 — Public pages and authentication
Landing/legal pages, sign-up and log-in validation, wrong password, forgot password, admin sign-up, route guards.

**39 of 39 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | homepage renders hero + feature sections | PASS |
| 2 | homepage header has Log in / Sign up | PASS |
| 3 | footer has Admin entry + legal links | PASS |
| 4 | /privacy legal page renders | PASS |
| 5 | /terms legal page renders | PASS |
| 6 | /login opens the login popup | PASS |
| 7 | /signup opens the signup popup | PASS |
| 8 | unknown route does not crash | PASS |
| 9 | logged-out /dashboard: shows login popup, no app data | PASS |
| 10 | logged-out /dashboard: URL is normalised to / | PASS |
| 11 | logged-out /tasks shows no app content | PASS |
| 12 | logged-out /calendar shows no app content | PASS |
| 13 | logged-out /team shows no app content | PASS |
| 14 | logged-out /settings shows no app content | PASS |
| 15 | logged-out /users shows no app content | PASS |
| 16 | logged-out /system shows no app content | PASS |
| 17 | logged-out /activity shows no app content | PASS |
| 18 | signup: empty name rejected | PASS |
| 19 | signup: invalid email rejected | PASS |
| 20 | signup: short password rejected | PASS |
| 21 | signup: mismatched passwords rejected | PASS |
| 22 | signup success -> BLANK login popup with notice | PASS |
| 23 | login: blank submit rejected | PASS |
| 24 | login: unknown email -> clear error | PASS |
| 25 | login: wrong password -> error (email matched case-insensitively) | PASS |
| 26 | forgot: an unknown email never reveals whether an account exists | PASS |
| 27 | forgot: known email shows sent confirmation | PASS |
| 28 | Escape closes the popup | PASS |
| 29 | member cannot sign in through the admin portal | PASS |
| 30 | admin portal shows no demo credentials | PASS |
| 31 | admin signup: wrong invite code rejected | PASS |
| 32 | admin signup: missing invite code rejected | PASS |
| 33 | member login lands on dashboard | PASS |
| 34 | member sees member navigation (no admin items) | PASS |
| 35 | member opening /users is sent back to the dashboard | PASS |
| 36 | logout returns to the homepage | PASS |
| 37 | after logging out, going Back/forward to a private page lands on the homepage | PASS |
| 38 | logging in again works after a logout | PASS |
| 39 | no uncaught JS errors / console errors in this area | PASS |

### Scenario 2 — Personal workspace
Projects, tasks, Kanban/list views, filters, task tabs, files, time tracking.

**43 of 43 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | dashboard: hero stats render for a brand-new account | PASS |
| 2 | dashboard: getting-started checklist is shown | PASS |
| 3 | workspace: empty state invites creating a project | PASS |
| 4 | project: created and shown as a card | PASS |
| 5 | project: empty name is rejected | PASS |
| 6 | project: second project created | PASS |
| 7 | milestone: added in the project dialog | PASS |
| 8 | project: rename saved | PASS |
| 9 | milestone: persisted after reopening | PASS |
| 10 | projects: Gantt timeline view renders | PASS |
| 11 | project: archived project disappears from the active list | PASS |
| 12 | project: archived project visible under "Show archived" | PASS |
| 13 | project: unarchive restores it | PASS |
| 14 | task: three tasks created on the Kanban board | PASS |
| 15 | task: empty title is rejected with a message | PASS |
| 16 | kanban: drag a card into In Progress | PASS |
| 17 | task modal: opens with the saved details | PASS |
| 18 | subtasks: two added with live count badge | PASS |
| 19 | subtasks: progress bar reflects 50% | PASS |
| 20 | subtasks: remove works | PASS |
| 21 | time: manual entry logged | PASS |
| 22 | time: timer is already running (started on create) | PASS |
| 23 | time: stop & log adds a tracked entry and stops the timer | PASS |
| 24 | time: resume restarts the timer | PASS |
| 25 | files: two files uploaded and listed | PASS |
| 26 | files: tab badge shows 2 | PASS |
| 27 | files: image preview opens | PASS |
| 28 | files: delete (with confirm) removes the file | PASS |
| 29 | task: edit saved | PASS |
| 30 | task card shows a live timer indicator | PASS |
| 31 | list view: shows all tasks | PASS |
| 32 | filter: search narrows results | PASS |
| 33 | filter: priority=low | PASS |
| 34 | filter: due within 7 days hides the task due in 8 days | PASS |
| 35 | filter: by tag | PASS |
| 36 | filter: by status | PASS |
| 37 | complete: finishing a task stopped its timer and logged the time | PASS |
| 38 | delete task: first click only asks for confirmation | PASS |
| 39 | delete task: second click deletes it | PASS |
| 40 | project card shows progress | PASS |
| 41 | delete project: asks twice and warns about its tasks | PASS |
| 42 | delete project: project removed | PASS |
| 43 | no uncaught JS errors / console errors in this area | PASS |

### Scenario 3 — Dashboard, tour, notifications, search, settings
Dashboard widgets, onboarding tour, notification bell, search, profile and settings.

**42 of 42 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | tour: starts automatically for a brand-new member | PASS |
| 2 | tour: Next walks through the steps (15 advanced) | PASS |
| 3 | tour: Back goes to the previous step | PASS |
| 4 | tour: Finish closes it | PASS |
| 5 | tour: it is "done" for this account (restart via menu only) | PASS |
| 6 | profile menu: Take a tour / Profile & settings / Log out | PASS |
| 7 | tour: can be restarted from the profile menu | PASS |
| 8 | tour: Skip closes it | PASS |
| 9 | popup: overdue warning appears for a task past its due date | PASS |
| 10 | popup: due-tomorrow reminder appears for a task due tomorrow | PASS |
| 11 | popup: nothing pops up for a task due in 12 days | PASS |
| 12 | dashboard: stats reflect the data (overdue count, tasks) | PASS |
| 13 | dashboard: upcoming deadlines list shows tasks | PASS |
| 14 | dashboard: overdue task is flagged | PASS |
| 15 | dashboard: recent activity lists my actions | PASS |
| 16 | dashboard: priority breakdown present | PASS |
| 17 | dashboard: no other user / admin data leaks (own tasks only) | PASS |
| 18 | bell: shows overdue + due-tomorrow notices | PASS |
| 19 | bell: shows today's Daily digest summary | PASS |
| 20 | bell: clicking a notice navigates to the task/project | PASS |
| 21 | bell: mark all as read clears the unread badge | PASS |
| 22 | search: finds a task by title | PASS |
| 23 | search: finds a project | PASS |
| 24 | search: finds a page | PASS |
| 25 | search: Enter opens the first result | PASS |
| 26 | search: no-match shows an empty state | PASS |
| 27 | settings: page shows the profile | PASS |
| 28 | profile: empty name rejected | PASS |
| 29 | profile: name saved and shown | PASS |
| 30 | profile: uploaded photo shown as the avatar | PASS |
| 31 | password: wrong current password rejected | PASS |
| 32 | password: mismatched confirmation rejected | PASS |
| 33 | password: changed (success confirmation shown) | PASS |
| 34 | theme: dark mode toggles the page theme | PASS |
| 35 | settings: two-step sign-in is honestly unavailable in the offline demo (no mail server) | PASS |
| 36 | settings: notification preference persists after leaving the page | PASS |
| 37 | settings: Daily digest is a real switch, on by default (no "Coming soon") | PASS |
| 38 | settings: turning Daily digest off is remembered after leaving the page | PASS |
| 39 | settings: Daily digest can be turned back on | PASS |
| 40 | password change took effect: old password no longer works | PASS |
| 41 | login with the new password works and the new name persisted | PASS |
| 42 | no uncaught JS errors / console errors in this area | PASS |

### Scenario 4 — Calendar
Month/week views and task dates.

**26 of 26 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | calendar: month grid with today highlighted | PASS |
| 2 | calendar: weekday headers | PASS |
| 3 | calendar: project milestone appears on its date | PASS |
| 4 | calendar: next/previous month change the title | PASS |
| 5 | calendar: Today returns to the current month | PASS |
| 6 | day sheet: empty day invites adding something | PASS |
| 7 | add dialog: the task form is shown immediately (no Continue button) | PASS |
| 8 | add dialog: due date is pre-set to the clicked day | PASS |
| 9 | add dialog: Task \| Reminder switcher present | PASS |
| 10 | add task: returns to the day sheet showing the new task | PASS |
| 11 | reminder: empty title rejected | PASS |
| 12 | reminder: shown in the day sheet with its time | PASS |
| 13 | reminder edit: form opens prefilled | PASS |
| 14 | reminder edit: change saved | PASS |
| 15 | day sheet: Edit opens the task editor | PASS |
| 16 | day sheet: edited task saved | PASS |
| 17 | reminder delete: asks for confirmation first | PASS |
| 18 | reminder delete: removed after confirming | PASS |
| 19 | task delete from the day sheet works | PASS |
| 20 | popup waits while the day sheet is still open | PASS |
| 21 | popup: reminder due tomorrow pops up after the sheet closes | PASS |
| 22 | popup: does not pop up again once dismissed | PASS |
| 23 | agenda: lists upcoming items by day | PASS |
| 24 | calendar: can switch back to the month view | PASS |
| 25 | calendar: a day with items is visibly marked | PASS |
| 26 | no uncaught JS errors / console errors in this area | PASS |

### Scenario 5 — Teams
Create team, invite code, About tab save, announcements, team projects, join by code/Discover, requests approve/decline, fair auto-assign, reassign, drag swap, member view, workflow, turn-in/approve, chat, reports, leave/disband.

**60 of 60 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | team hub: empty state offers Create / Join | PASS |
| 2 | create team: empty name rejected | PASS |
| 3 | team workspace opens with all admin tabs | PASS |
| 4 | members: invite code shown and 6 chars | PASS |
| 5 | members: owner is listed with Owner badge | PASS |
| 6 | about: regenerating the invite code changes it | PASS |
| 7 | about: team name/description saved | PASS |
| 8 | announcements: admin can post | PASS |
| 9 | team project: created by the admin | PASS |
| 10 | discover: Ben sees the public team card | PASS |
| 11 | discover: private details are hidden (no invite code, no member names) | PASS |
| 12 | discover: joining a public team files a REQUEST (not instant membership) | PASS |
| 13 | my teams: pending request is listed with a Cancel option | PASS |
| 14 | requester can withdraw the request (Join offered again) | PASS |
| 15 | join by code: wrong code rejected | PASS |
| 16 | join by code: request sent and popup closed (codes are case-insensitive) | PASS |
| 17 | Cleo: public join also files a request | PASS |
| 18 | members tab shows pending request count | PASS |
| 19 | join requests: both people listed | PASS |
| 20 | join requests: decline removes Cleo | PASS |
| 21 | join requests: approve adds Ben as a member | PASS |
| 22 | roles: promote to admin | PASS |
| 23 | roles: demote back to member | PASS |
| 24 | create & assign: result summary shown | PASS |
| 25 | member tasks: all 4 auto-assigned tasks visible | PASS |
| 26 | member tasks: a lane per member (owner + Ben) with their names | PASS |
| 27 | fair auto-assign: 4 tasks split 2/2 between the two members | PASS |
| 28 | reassign: a task can be set to Unassigned | PASS |
| 29 | reassign: and handed to a member | PASS |
| 30 | drag a task onto another lane's task swaps their assignees | PASS |
| 31 | audit trail: shows assignment history entries | PASS |
| 32 | audit trail: filter by member works | PASS |
| 33 | member (not admin) sees no "Assign task" tab | PASS |
| 34 | announcements: members can read but not post | PASS |
| 35 | projects: Ben sees EXACTLY the tasks assigned to him, nothing else | PASS |
| 36 | workflow: assignee moves a task To Do -> In Progress | PASS |
| 37 | turn in: task moves to review ("awaiting approval") | PASS |
| 38 | turn in: assignee can take it back while it awaits review | PASS |
| 39 | undo turn in: task is back In Progress | PASS |
| 40 | chat: send a message | PASS |
| 41 | chat: Enter sends; mention is shown | PASS |
| 42 | chat: quick like sends a thumbs-up message | PASS |
| 43 | chat: reply banner appears | PASS |
| 44 | chat: reply sent | PASS |
| 45 | chat: reaction added | PASS |
| 46 | chat: delete leaves a "message deleted" placeholder | PASS |
| 47 | chat: photo message shows the image | PASS |
| 48 | owner: tab shows items to review | PASS |
| 49 | review: admin sees the turn-in note and who turned it in | PASS |
| 50 | review: returning with a reason sends it back | PASS |
| 51 | bulk: Select mode shows "Select all" and Cancel | PASS |
| 52 | bulk: clicking a card selects it (count shown) | PASS |
| 53 | bulk: delete asks for confirmation | PASS |
| 54 | bulk: the selected task is deleted | PASS |
| 55 | reports: tab renders charts/stats for the team | PASS |
| 56 | reports: project filter keeps the report rendered | PASS |
| 57 | leave team: Ben is back at the team hub without the team | PASS |
| 58 | disband: first click only asks to confirm | PASS |
| 59 | disband: team is gone | PASS |
| 60 | no uncaught JS errors / console errors in this area | PASS |

### Scenario 6 — Site admin
Admin pages, Users page (ban/unban, roles, delete), system settings, activity log.

**36 of 36 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | admin: lands on dashboard, no guided tour | PASS |
| 2 | admin: no search bar in the top bar | PASS |
| 3 | admin: sidebar has the admin pages | PASS |
| 4 | admin: profile menu has no "Take a tour" | PASS |
| 5 | admin dashboard: totals for the whole site | PASS |
| 6 | admin dashboard: counts reflect real data (2 projects, 1 task) | PASS |
| 7 | admin dashboard: 6/12 month toggle works | PASS |
| 8 | admin dashboard: charts rendered (svg) | PASS |
| 9 | users: every account is listed (3 members + me) | PASS |
| 10 | users: emails are visible to the admin only here | PASS |
| 11 | users: search by name/email | PASS |
| 12 | users: search by exact email | PASS |
| 13 | users: no-match empty state | PASS |
| 14 | users: own row cannot be demoted / banned / deleted | PASS |
| 15 | users: promote a member to admin | PASS |
| 16 | users: demote back to member | PASS |
| 17 | users: ban shows an Unban control | PASS |
| 18 | banned user cannot log in (clear message) | PASS |
| 19 | users: unban restores the account | PASS |
| 20 | admin team page: team, its project, and chat METADATA only (no chat text) | PASS |
| 21 | admin workspace: lists users' personal projects/tasks (read-only) | PASS |
| 22 | admin workspace: no create/edit controls | PASS |
| 23 | settings: choices persist when leaving the page | PASS |
| 24 | admin calendar: only "Add reminder" is offered | PASS |
| 25 | admin calendar: no Task tab, reminder form shown directly | PASS |
| 26 | admin: due-tomorrow reminder pop-up appears | PASS |
| 27 | activity log: shows sign-ins, creations and admin actions | PASS |
| 28 | activity log: filter by area | PASS |
| 29 | activity log: filter by user | PASS |
| 30 | activity log: free-text search | PASS |
| 31 | users: delete asks for confirmation first | PASS |
| 32 | users: account deleted | PASS |
| 33 | cascade: her team, project and chat are gone with her | PASS |
| 34 | cascade: her personal project and task are gone | PASS |
| 35 | admin: settings page shows only relevant notification options (no mentions) | PASS |
| 36 | no uncaught JS errors / console errors in this area | PASS |

### Scenario 7a — Phone layout (responsive + dark mode)
**25 of 25 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | phone: homepage has no horizontal overflow | PASS |
| 2 | phone: homepage shows a way to log in | PASS |
| 3 | phone: dashboard has no horizontal overflow | PASS |
| 4 | phone: primary navigation reachable | PASS |
| 5 | phone: projects has no horizontal overflow | PASS |
| 6 | phone: kanban board has no horizontal overflow | PASS |
| 7 | phone: task list has no horizontal overflow | PASS |
| 8 | phone: task dialog fits the screen | PASS |
| 9 | phone: calendar has no horizontal overflow | PASS |
| 10 | phone: team hub has no horizontal overflow | PASS |
| 11 | phone: team workspace has no horizontal overflow | PASS |
| 12 | phone: team tab Chat has no horizontal overflow | PASS |
| 13 | phone: team tab Projects has no horizontal overflow | PASS |
| 14 | phone: team tab Announcements has no horizontal overflow | PASS |
| 15 | phone: team tab Assign task has no horizontal overflow | PASS |
| 16 | phone: team tab Reports has no horizontal overflow | PASS |
| 17 | phone: team tab Members has no horizontal overflow | PASS |
| 18 | phone: settings has no horizontal overflow | PASS |
| 19 | phone: dark mode applies | PASS |
| 20 | phone: dark Dashboard renders without overflow | PASS |
| 21 | phone: dark My Workspace renders without overflow | PASS |
| 22 | phone: dark Calendar renders without overflow | PASS |
| 23 | phone: dark Team renders without overflow | PASS |
| 24 | phone: dark mode headings are lighter than the background | PASS |
| 25 | no uncaught JS errors / console errors in this area | PASS |

### Scenario 7b — Tablet layout (responsive + dark mode)
**25 of 25 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | tablet: homepage has no horizontal overflow | PASS |
| 2 | tablet: homepage shows a way to log in | PASS |
| 3 | tablet: dashboard has no horizontal overflow | PASS |
| 4 | tablet: primary navigation reachable | PASS |
| 5 | tablet: projects has no horizontal overflow | PASS |
| 6 | tablet: kanban board has no horizontal overflow | PASS |
| 7 | tablet: task list has no horizontal overflow | PASS |
| 8 | tablet: task dialog fits the screen | PASS |
| 9 | tablet: calendar has no horizontal overflow | PASS |
| 10 | tablet: team hub has no horizontal overflow | PASS |
| 11 | tablet: team workspace has no horizontal overflow | PASS |
| 12 | tablet: team tab Chat has no horizontal overflow | PASS |
| 13 | tablet: team tab Projects has no horizontal overflow | PASS |
| 14 | tablet: team tab Announcements has no horizontal overflow | PASS |
| 15 | tablet: team tab Assign task has no horizontal overflow | PASS |
| 16 | tablet: team tab Reports has no horizontal overflow | PASS |
| 17 | tablet: team tab Members has no horizontal overflow | PASS |
| 18 | tablet: settings has no horizontal overflow | PASS |
| 19 | tablet: dark mode applies | PASS |
| 20 | tablet: dark Dashboard renders without overflow | PASS |
| 21 | tablet: dark My Workspace renders without overflow | PASS |
| 22 | tablet: dark Calendar renders without overflow | PASS |
| 23 | tablet: dark Team renders without overflow | PASS |
| 24 | tablet: dark mode headings are lighter than the background | PASS |
| 25 | no uncaught JS errors / console errors in this area | PASS |

### Scenario 8 — Robustness
Script injection in titles, double-click submit, long/unicode input, layout overflow.

**13 of 13 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | double-click Create project makes ONE project | PASS |
| 2 | hostile project name is shown as plain text, never executed | PASS |
| 3 | double-click Create task makes ONE task | PASS |
| 4 | hostile task title is rendered as text | PASS |
| 5 | a 400-character title does not break the page layout | PASS |
| 6 | unicode / emoji titles are stored intact | PASS |
| 7 | double-click Add reminder makes ONE reminder | PASS |
| 8 | hostile reminder text is inert | PASS |
| 9 | hostile team name rendered as text | PASS |
| 10 | chat: hostile message is inert text, and Enter-spam sends it once | PASS |
| 11 | rapid navigation across pages stays stable | PASS |
| 12 | no JS alerts were ever triggered by hostile input | PASS |
| 13 | no uncaught JS errors / console errors in this area | PASS |

### Scenario 9a — Persistence, before the restart
Creates a project, task, subtask and an uploaded file; saves the session token.

**4 of 4 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | created a task with a subtask and a file | PASS |
| 2 | page reload: still signed in (token in the tab sessionStorage) and the task is still there | PASS |
| 3 | after reload the project and task are loaded from the database | PASS |
| 4 | no uncaught JS errors / console errors in this area | PASS |

### Scenario 9b — Persistence, after a full server restart

The server process is stopped and started again; the same tab (session token kept in its session storage) is reused.

| # | Check | Result |
|---|---|---|
| 1 | after a FULL SERVER RESTART the same tab is still signed in (session stored in MongoDB) | PASS |
| 2 | the project and task survived the restart | PASS |
| 3 | its subtask survived | PASS |
| 4 | its attached file is still listed | PASS |
| 5 | the file BYTES survived on disk and download correctly ("keep me") | PASS |

### Scenario 19 — Team visibility switch, company roles, role-tag auto-assignment, live updates (NEW)
Three browser tabs at once (owner, member, site admin) against the real stack. Nobody reloads the member or admin tab.

**34 of 34 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | card: the owner gets a Public/Private switch on the team card | PASS |
| 2 | card: a new team starts Public | PASS |
| 3 | discover: Ben sees the public team | PASS |
| 4 | live: Ben's tab opened the live stream | PASS |
| 5 | card: switching to Private takes effect at once | PASS |
| 6 | live: Ben's Discover list drops the team by itself (0.2s) | PASS |
| 7 | card: Private survives a page reload (saved on the server) | PASS |
| 8 | live: switching back to Public shows it to Ben again (0.3s) | PASS |
| 9 | live: Ben's tab was never reloaded | PASS |
| 10 | live: the owner's team card shows the join request | PASS |
| 11 | members: Ben approved | PASS |
| 12 | live: Ben's My teams now lists the team | PASS |
| 13 | card: a plain member sees Public/Private as text, with no switch | PASS |
| 14 | assign form: says no member has a company role yet | PASS |
| 15 | assign form: every task row has a Tags field | PASS |
| 16 | users: the admin sees a Company role picker per member | PASS |
| 17 | users: roles are grouped by kind of company | PASS |
| 18 | users: the list has the expected roles | PASS |
| 19 | users: the choice sticks | PASS |
| 20 | live: the owner's assign form now lists the role tags (0.0s) | PASS |
| 21 | members: everyone's company role is shown to the team | PASS |
| 22 | assign: reports tasks left unassigned (nobody has the Finance role) | PASS |
| 23 | assign: "frontend" task went to the Frontend Developer (Ben) | PASS |
| 24 | assign: "backend" task went to the Backend Developer (Maya) | PASS |
| 25 | assign: "finance" task (no one has the role) was left unassigned | PASS |
| 26 | assign: untagged task was shared among everyone | PASS |
| 27 | assign: the role tag is stored on the task | PASS |
| 28 | live: Ben's open project shows his new task without a reload (0.0s) | PASS |
| 29 | member view: Ben does NOT see the backend or unassigned tasks | PASS |
| 30 | live: Ben receives the chat message without refreshing (0.3s) | PASS |
| 31 | chat: a new message does not scroll Ben away from the old ones he is reading | PASS |
| 32 | transport: every signed-in tab holds a live stream open | PASS |
| 33 | transport: nothing was ever reloaded in B (same page throughout) | PASS |
| 34 | no uncaught JS errors / console errors in this area | PASS |

### Scenario 20 — Daily digest (NEW)
Settings switch, the once-a-day summary in the bell, its counts, on/off behaviour, other people's tasks, and the admin's site-wide switch. Mirrors scenario 14 of the manual checklist.

**16 of 16 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | settings: Daily digest is a real switch, on by default (no "Coming soon") | PASS |
| 2 | settings: it can be turned off | PASS |
| 3 | bell: with the switch off there is no Daily digest (the usual deadline notices still arrive) | PASS |
| 4 | settings: it can be turned back on | PASS |
| 5 | digest: switching it on creates today's digest straight away | PASS |
| 6 | digest: counts are right (30-day and finished tasks are left out) | PASS |
| 7 | digest: it never pops up on its own | PASS |
| 8 | digest: it is unread (the bell shows an unread count) | PASS |
| 9 | digest: clicking it opens the Tasks page | PASS |
| 10 | digest: off then on again does not make a second digest for the same day | PASS |
| 11 | other person: no tasks means no digest, and Dana's tasks are never counted | PASS |
| 12 | admin: turns the site-wide deadline alerts off | PASS |
| 13 | site switch off: no digest is made, even for someone with an overdue task | PASS |
| 14 | site switch back on: the digest arrives | PASS |
| 15 | "Due-date reminders" is separate: it can be off while Daily digest stays on | PASS |
| 16 | no uncaught JS errors / console errors in this area | PASS |

### Scenario 21 — Accurate auto-allocation (NEW)
Skill levels set on the Users page, the Priority picker and live role preview, role read from a tag or the title, big tasks going to the senior, tie-break, hand-picked work counting as workload, unassigned when nobody has a tagged role, and the server refusing non-admins and faked "auto" claims. Mirrors scenario 15 of the manual checklist.

**23 of 23 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | users: every member row has a Skill level picker next to Company role | PASS |
| 2 | users: the levels are Not set / Junior / Mid-level / Senior | PASS |
| 3 | users: the level choice sticks after a refresh | PASS |
| 4 | members: each person's company role and skill level are shown (arrived live) | PASS |
| 5 | form: every task row has a Priority picker (Low / Medium / High) | PASS |
| 6 | preview: a role is read from the TITLE ("react") | PASS |
| 7 | preview: a tag nobody holds says it will be left unassigned | PASS |
| 8 | preview: no role words means shared by workload | PASS |
| 9 | result: a reason is shown for every assigned task | PASS |
| 10 | result: the reason for the high-priority task mentions the skill level it needed | PASS |
| 11 | result: the title-based role is explained | PASS |
| 12 | result: the task needing a role nobody has is reported as unassigned | PASS |
| 13 | allocation: role read from the title -> the senior frontend developer (most spare capacity) | PASS |
| 14 | allocation: a tie in load goes to whoever was assigned least recently (Cleo) | PASS |
| 15 | allocation: a high-priority task skips the junior and goes to the senior | PASS |
| 16 | allocation: a role named by a TAG that nobody holds -> left unassigned | PASS |
| 17 | allocation: with no role needed, the least-loaded person (Maya) takes it | PASS |
| 18 | stored: the server marked the automatic ones and kept the reason in the history | PASS |
| 19 | hand-picked: tasks picked by hand go to the chosen person and are not marked automatic | PASS |
| 20 | workload: Ben is now busy with hand-picked work, so the next frontend job goes to Cleo | PASS |
| 21 | server: a plain member cannot use the allocation endpoint (403) | PASS |
| 22 | server: a request cannot claim an assignment was automatic | PASS |
| 23 | no uncaught JS errors / console errors in this area | PASS |

### Scenario 19 again — with the live (push) stream blocked

Same scenario, but the browser refuses `/api/live`, so every tab relies on the 5-second timer. Timing limits are relaxed in this mode (updates took 0.6–3.6 s here, against 0.0–0.3 s with push).

**33 of 33 checks passed.**

| # | Check | Result |
|---|---|---|
| 1 | card: the owner gets a Public/Private switch on the team card | PASS |
| 2 | card: a new team starts Public | PASS |
| 3 | discover: Ben sees the public team | PASS |
| 4 | fallback: the stream is blocked in this run | PASS |
| 5 | card: switching to Private takes effect at once | PASS |
| 6 | live: Ben's Discover list drops the team by itself (0.7s) | PASS |
| 7 | card: Private survives a page reload (saved on the server) | PASS |
| 8 | live: switching back to Public shows it to Ben again (2.3s) | PASS |
| 9 | live: Ben's tab was never reloaded | PASS |
| 10 | live: the owner's team card shows the join request | PASS |
| 11 | members: Ben approved | PASS |
| 12 | live: Ben's My teams now lists the team | PASS |
| 13 | card: a plain member sees Public/Private as text, with no switch | PASS |
| 14 | assign form: says no member has a company role yet | PASS |
| 15 | assign form: every task row has a Tags field | PASS |
| 16 | users: the admin sees a Company role picker per member | PASS |
| 17 | users: roles are grouped by kind of company | PASS |
| 18 | users: the list has the expected roles | PASS |
| 19 | users: the choice sticks | PASS |
| 20 | live: the owner's assign form now lists the role tags (2.8s) | PASS |
| 21 | members: everyone's company role is shown to the team | PASS |
| 22 | assign: reports tasks left unassigned (nobody has the Finance role) | PASS |
| 23 | assign: "frontend" task went to the Frontend Developer (Ben) | PASS |
| 24 | assign: "backend" task went to the Backend Developer (Maya) | PASS |
| 25 | assign: "finance" task (no one has the role) was left unassigned | PASS |
| 26 | assign: untagged task was shared among everyone | PASS |
| 27 | assign: the role tag is stored on the task | PASS |
| 28 | live: Ben's open project shows his new task without a reload (0.4s) | PASS |
| 29 | member view: Ben does NOT see the backend or unassigned tasks | PASS |
| 30 | live: Ben receives the chat message without refreshing (2.9s) | PASS |
| 31 | chat: a new message does not scroll Ben away from the old ones he is reading | PASS |
| 32 | transport: nothing was ever reloaded in B (same page throughout) | PASS |
| 33 | no uncaught JS errors / console errors in this area | PASS |

## 4. Earlier failures (now fixed), and what was not run

### 4.1 Scenarios 1, 3 and 8: fixed

In the previous run these three did not pass. They failed identically on your original v47, and the causes were in the scripts (plus one missing feature), not in the new work. All three now pass on the real stack **and** on the offline demo build.

| Scenario | What was wrong | What was done | Now |
|---|---|---|---|
| 1 | The script expected the words "no account" after asking to reset the password for an unknown email. The emailed-code reset never says that (without a mail server: "not set up yet"; with one: the same answer for known and unknown addresses, on purpose). | The check now asserts the real, safer behaviour: an unknown email never reveals whether an account exists. | 39/39 |
| 3 | The script looked for a "Daily digest" switch marked "Coming soon". That switch was missing from the app. | **The Daily digest was built** (using v40's switch and wording as the reference): a real switch in Settings plus a once-a-day summary in the bell. The script now checks the real thing: switch on by default, toggle off and on and remembered, and the digest appearing in the bell. | 42/42 |
| 8 | A task created with today's date makes the app's "Due today" reminder pop up. Its backdrop covered the page and the script's next click could not land. The tasks themselves were created correctly. | The script now closes reminder pop-ups before each page change. | 13/13 |

Because the digest is on by default and adds one bell entry, four older tests that counted notifications exactly were adjusted to count deadline notices only; the digest has its own tests (section 5).

### 4.2 Scripts that exist but were not run in this session

They need their own special servers (see each file's header) or a fake Google verifier: `s6_google_auth`, `s7_email_code`, `s10_two_tabs`, `s11_refresh_keeps_page`, `s12_auth_popup_refresh`, `s13_input_survives_refresh`, `s14_password_reset`, `s15_dev_refresh`, `s16_overdue_toggle`, `s17_member_alerts_toggle`, `s18_load_failure`.

### 4.3 Not covered by any automated check

- Real **MongoDB Atlas** (I used a local MongoDB 8); Atlas latency may change timings.
- Real mail delivery, the Windows/OneDrive environment, and browsers other than Chromium.
- Several copies of the server behind a load balancer (live updates assume one server process).

## 5. Appendix — automated test inventory (unit and integration)

Every test title, by file. The first four files run in memory (`npm run test:api`) **and** against MongoDB and over HTTP (`test:mongo`, `test:http`).

### Services — `src/api/__tests__/services.test.mjs` (28 tests)

- passwords are hashed and emails are unique case-insensitively
- nobody can act without a session, and a client cannot choose who it is
- personal tasks are private; assignees are IDs with display names populated
- team workflow: only admins create/approve, only the assignee turns in
- leaving or being removed frees unfinished tasks; disbanding purges everything
- only the owner disbands; strangers cannot read a private team
- deleting a user cascades: personal data gone, teams passed on, tasks freed
- timers live on the task and stop logs time
- deadline notices are idempotent, dismissible, and respect settings
- either switch off silences BOTH the overdue and the due-tomorrow notices, and turning it back on restores them
- overdue pop-up: off means no pop-up, and turning it back on pops overdue tasks up again immediately
- site admin gets reminders only, can silence deadlines, and cannot be self-destructive
- admin reminders pop up the day before AND on the due date, and follow the profile switch
- members are also reminded on the day a task is due
- profile edits persist, emails stay unique, and renames show everywhere by ID
- banned accounts are signed out and cannot act
- chat: members only, mentions notify, reactions toggle, deletes leave a placeholder
- only the team owner can switch a team between public and private, and it shows to everyone at once
- company roles: only the site admin sets them, only known roles are accepted, teammates can see them
- asking for the snapshot twice with nothing changed gives identical data (the quiet background refresh relies on this)
- daily digest: one summary per day with the right counts, never a second one the same day
- daily digest: nothing to say means no digest, and finished/other people\'s tasks are not counted
- daily digest: the "Daily digest" preference and the site-wide deadline switch both control it
- daily digest: admins (who have no tasks) get one only for their calendar reminders; old digests are cleared out
- allocation: role, skill level, workload and tie-break all play a part, and each choice is explained
- allocation: workload is REAL, meaning open team tasks in every project count, hand-picked ones too, finished ones and suspended people do not
- allocation: only team admins can use it, the input is validated before anything is created, and the server owns "auto"
- skill level: only the site admin sets it, only known levels, teammates see it, a person cannot set their own

### Full API coverage — `src/api/__tests__/full.test.mjs` (18 tests)

- auth: reset, getMe, changePassword, settings, validation
- tasks: update rules, bulk delete, subtasks, comments, time, estimate, timer
- files and attachments: upload, attach, size limit, release, ownership
- projects: update, archive, milestones, delete cascade
- reminders: validation and ownership
- team workflow: move, turn in, undo, return, reassign, swap, bulk delete, tampering
- teams: codes, public/private joining, requests, roles, announcements
- chat: validation, replies, images, pagination, deletion
- profile photo: teammates get the photo URL and may read it; strangers may not download it
- notifications and activity APIs
- account management: sessions die on ban/delete, last admin protected, admin sees no team chat text
- non-site-admin cannot use admin functions
- settings: only whitelisted keys are saved
- regression: recent activity is not crowded out by page visits
- concurrent edits to one task never lose each other
- concurrent team approvals all land
- concurrent reactions from different people are all kept
- the database picks exactly one winner for racing sign-ups, join requests and notices

### Google sign-in — `src/api/__tests__/google.test.mjs` (12 tests)

- the Google button is configured from the server, and off by default
- first Google sign-in creates a member account and signs them in
- signing in again with Google reuses the same account, even if the Google email changed
- a forged, unverified or malformed Google token is refused and creates nothing
- admin portal: no account and no invite code creates nothing
- admin sign-up with Google needs the invite code, then later sign-ins do not
- a Google account cannot cross portals: members never become admins, admins are not members
- an existing password account is linked by its verified email; the old password stops working and old sessions end
- a Google-only account can set a password and then use either method
- an email tied to one Google account cannot be claimed by another
- banned accounts cannot sign in with Google, and a banned Google user is signed out
- two first-time Google sign-ins at once make one account

### Emailed code — `src/api/__tests__/emailcode.test.mjs` (30 tests)

- the config tells the forms whether codes are required and whether mail can be sent
- password, then code: no session until the emailed code is entered
- a wrong password never sends a code
- a code works once only
- a wrong code is refused with the tries left, and five wrong tries lock it for good
- the code alone is not enough: the token from the password step is needed, and tokens are not interchangeable
- codes must be exactly six digits
- an expired code is refused
- resending: rate-limited, replaces the old code, and capped per attempt
- starting sign-ins for one address is capped per hour
- only hashes are stored: neither the code nor the token can be read back from the database
- sign-up needs the emailed code: nothing is created until it is entered, then the person is signed in
- sign-up checks everything up front: duplicate email, weak password, and the admin invite code, before any email is sent
- a sign-up cannot be turned into a login for someone else, and the pending account cannot collide
- portals and bans are checked before a code is sent and again when it is entered
- it fails closed: with no way to send mail, nobody is let in without a code
- if the email cannot be sent, nothing is stored and no limit is used up
- without the server-wide rule, people can opt in from Settings, and only where mail works
- Google sign-in is its own verified route and does not ask for an emailed code
- reset password: the emailed code and a new password change the password, and the old one stops working
- reset password: the answer is the same for an address with no account, and nothing is emailed
- reset password: a banned account gets no code either
- reset password: wrong codes are counted and the code works only once
- reset password: a too-short new password is refused WITHOUT using up the code
- reset password: every existing session of the account is signed out
- a reset code can never sign anyone in, and a sign-in code can never reset a password
- reset password: the code can be re-sent, and the new email says it is for a reset
- reset password: without a mail account the request says so instead of pretending to send
- admin sign-in follows the "Require 2FA for admins" switch, not the server-wide default
- an admin who turned on their own code is still asked for it; the admin switch cannot be forced on without mail

### Session tokens — `src/api/__tests__/session-token.test.mjs` (9 tests)

- sign-in stores the token from the response and every later request sends it as a Bearer header
- a request made before sign-in carries no Authorization header
- a second sign-in in the same tab replaces the token (a different tab is a different module state, see the browser test)
- logout forgets the token even when the request fails
- an UNAUTHORIZED answer drops a dead token, but a wrong password does not touch a live one
- a late UNAUTHORIZED for an old token does not wipe a newer sign-in
- bootstrap reporting nobody signed in drops the stale token, unless a newer sign-in happened meanwhile
- subscribers hear about sign-in and sign-out, and an unchanged token is not a change
- file URLs: only our own API paths get the token; other URLs pass through untouched

### Saved screen state — `src/api/__tests__/ui-state.test.mjs` (6 tests)

- a saved value comes back only after a (simulated) page load, not during the same visit
- objects, arrays, empty strings and false round-trip
- undefined removes a saved value
- corrupt storage is ignored instead of throwing
- signing in, out or switching account wipes everything saved
- clearSavedState leaves unrelated storage alone

### Accurate allocation rules (new) — `src/api/__tests__/allocation.test.mjs` (17 tests)

- role list: unique ids and tags, every role has lowercase keywords, and each role\'s own words point to it
- roles from tags: the role tag, a keyword used as a tag, and spelling variants all work
- roles from the title: keywords, plurals and phrases are found; ties pool both roles; nothing found means any role
- roles: a tag beats the title, and tags that are not roles are ignored
- task weight: priority, estimate, due date pressure and status all count
- the skill level a task needs grows with its size
- workload decides, not how many tasks someone has: one huge task outweighs several small ones
- seniors can carry more: capacity scales the workload
- only people with the needed role are considered, and explicit tags are strict
- a role only GUESSED from the title is a weak signal: with nobody holding it the task is shared by workload
- big tasks go to experienced people, even if a junior is less busy
- when nobody in the role is senior enough the most senior is used, and the note says so
- the level rule applies with no role too
- ties go to whoever was auto-assigned something longest ago, then by id: the same inputs always give the same answer
- nobody on the team means unassigned, and the note explains why
- tag input is split, cleaned and de-duplicated
- "today" from a request is only trusted within two days of the server date

### Background refresh timer (new) — `src/api/__tests__/livepoller.test.mjs` (4 tests)

- polls on the interval while visible, and stops after being stopped
- a hidden tab is not polled, and coming back refreshes immediately
- failures are swallowed and retried with a growing pause; success resets it
- never runs two refreshes at once

### Live stream reader (new) — `src/api/__tests__/livestream.test.mjs` (5 tests)

- the stream parser reads events however the bytes are sliced, and ignores heartbeats
- multi-line data is joined, and an event with no data is not delivered
- startLiveStream reports connected, fires onChange per "changed", and stops when asked
- a dropped stream is reported as disconnected and reconnected; a 401 stops for good
- with no session token it does not connect at all

### Live updates push server (new) — `server/test/live.test.mjs` (8 tests)

- a burst of writes becomes ONE "changed" message to each stream
- the tab that made the only change in a window is not pinged about it; everyone else is
- the message carries nothing but a counter
- a heartbeat is sent, and a stream whose session is no longer valid is told so and closed
- one person cannot hold unlimited streams open: the oldest is closed first
- /live refuses anyone who is not signed in
- a write by one person reaches another person\'s open stream, but not the writer\'s own tab
- closing the hub (server shutdown) ends every open stream

### Auth coverage — `server/test/auth-coverage.test.mjs` (13 tests)

- the public allow-list is exactly what we intend, nothing else is public
- every protected route refuses a request with no session (401), with or without a forged token
- logging out with no session is a harmless no-op that grants nothing
- an anonymous upload is refused (401) BEFORE the file is read, even an oversized one
- the file download route is protected too
- state-changing requests also need the CSRF header, even for signed-in people
- manual and Google sign-in create equivalent sessions: both open protected data, both end on logout
- a session cannot be reused after sign-out, whichever way it began
- admin routes: refused for members (however they signed in), allowed for admins (however they signed in)
- the test-only reset endpoint does not exist outside test mode
- two accounts signed in at the same time stay separate: a later sign-in never changes who an earlier tab is
- the old shared cookie is no longer an identity, and sign-in never puts the token in one
- a malformed Authorization header is treated as no session

### HTTP layer — `server/test/http.test.mjs` (12 tests)

- health, security headers, and no framework fingerprint
- every write needs the custom header (CSRF defence); reads do not
- the session token goes to the tab once, in no cookie, and the database never stores it raw
- errors are JSON with a stable shape; unknown routes and bad bodies are handled
- unauthenticated callers are refused with 401 everywhere that needs a person
- query-operator injection is rejected before it can reach the database
- privacy over HTTP: one person cannot read or change another\'s data
- files: stored by id, sanitised names, downloads are locked down and permission-checked
- a file attached to a team task is readable by the team admin, not by an outsider
- sessions end for real: logout, ban, and idle time all invalidate the token server-side
- CORS: other origins get no permission; the configured one would
- brute-force protection: repeated sign-in attempts are rate limited

_(162 test titles listed.)_
