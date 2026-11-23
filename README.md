# TaskIT — Task Management System (Front-End)

A complete, front-end-only Task Management System UI built with **React (Vite)**,
**Tailwind CSS**, **lucide-react** icons, and **Recharts**. All data is mocked and
lives in client-side React state — there is no backend.

## Getting started

```bash
npm install
npm run dev       # start the dev server (http://localhost:5173)
npm run build     # production build to /dist
npm run preview   # preview the production build locally
npm run lint      # run oxlint
```

Requires **Node.js `^20.19.0` or `>=22.12.0`** (this is enforced by the `engines`
field in `package.json` — Vite 8 will not run on Node 18 or on odd-numbered
Node 21). If `npm install` or `npm run dev` fails with syntax or ESM-related
errors, check `node -v` first.

## Routes

- `/` — public homepage (header, hero banner, feature showcase, about, footer). Its preview images are built from the app's real components.
- **Log in and sign up are popups on the homepage** (`/login` and `/signup` just redirect to `/?auth=login` / `/?auth=signup`; there is no separate login page). Opening a protected link while signed out — e.g. a team invite link — shows the popup and, after logging in, continues to that link. Creating an account switches the popup to its log-in view instead of signing in automatically.

- `/privacy`, `/terms` — dedicated Privacy Policy and Terms of Service pages (no footer).
- `/dashboard` and every other app page — require sign-in. **The footer exists on the homepage only.**

## Feature overview

- **User management** — sign up / sign in as Member or Admin (email + password, then a 6-digit code emailed to the address; or "Continue with Google" when the server has a `GOOGLE_CLIENT_ID`), role-based
  routing, profile editing, change password, a mock "forgot password" flow,
  and admin-controlled account activation/suspension.
- **Dashboard** — a first-look "getting started" checklist, completion stats,
  priority breakdown, upcoming deadlines, project progress, and recent
  activity.
- **Projects** — create/edit/archive/delete projects, statuses (Planning →
  Active → On Hold → Completed), members, and milestones; grid view or a
  Gantt timeline.
- **Tasks** — Kanban board or list view, drag-and-drop between statuses,
  subtasks, dependencies, recurrence, labels/tags, and search & filters
  (status, priority, tag, assignee, project, due date).
- **Task detail** — tabbed modal for Details, Subtasks (with progress
  rollup), Comments (with @mentions), Files (mock upload/version/download),
  and Time tracking (start/stop timer, manual entries, estimate vs. actual).
- **Calendar** — month grid and a two-week agenda view showing task
  deadlines and project milestones.
- **Team** — per-person workload balance and a shared announcements feed
  (admins can post).
- **Team roles and role-based assignment** (Team → Members tab, Team → Assign task) — each team has its own list of
  roles, defined by the team's admins ("Frontend", "QA"...). A role can only be deleted once nobody holds it.
  1. **Joining**: a team that has roles asks the newcomer to pick one (by invite code, link or Discover). The choice
     travels with the join request and is applied when an admin approves it.
  2. **Changing roles**: a member cannot change their own role. Only an admin can, by *proposing* a role; it takes
     effect when that member accepts, and the member can decline (an admin can cancel a pending proposal). An admin's
     own role applies at once, since nobody else needs to approve it.
  3. **Creating tasks**: every team task needs a role. The **server** (`createTeamTasks` / `createTask` in
     `taskService.js`) picks the assignee, so the browser cannot choose or fake it. A batch is split evenly per role
     (`splitEvenly`): 5 tasks for a role of 4 people is one each, and the extra task goes to one randomly chosen
     person. A single task goes to a random holder. Suspended people are skipped. A role nobody holds is refused, and
     a batch is checked row by row before anything is created. The task keeps the role it was made for (`roleId`,
     `roleName`).
  Limits: each batch is split on its own and nothing is remembered between requests, so tasks created one at a time are
  purely random; the split counts tasks, not hours or open work, so it ignores workload and skill; a task can still be
  reassigned by hand afterwards
  to someone outside its role; a hand-picked assignee at creation is ignored; members who joined before any roles
  existed have no role until an admin proposes one and they accept it (the Members tab shows "No role yet"); the request rate limiter and the
  live-update push list both live in the memory of one server process, so run one copy of the server. The owner can
  switch a team between Public and Private from its card on the Team page or from its Members tab.
- **Team reports** (Team → Reports tab, per team) — charts for tasks by status/priority, tasks per
  project, team workload, and time logged per project.
- **Admin panel** — account directory (role + activation controls), system
  settings (2FA requirement, session timeout, notification
  defaults), and a full activity/audit log.
- **Daily digest** — a switch in Settings → Notifications (on by default). Once a day, the first time the app syncs on
  a new date (or at once when you switch it on later that day), the bell gets one entry such as "Daily digest: 2 overdue,
  1 due today, 1 due tomorrow, 3 more due in the next 7 days, 1 reminder today." Only your own tasks count; nothing to
  report means no digest; it never pops up. It follows both your own switch and the admin's site-wide "Deadline &
  overdue alerts" switch, and digests older than a week are cleared. Code: `syncDeadlines` / `digestMessage` in
  `src/api/services/notificationService.js`.
- **Live updates** — when the app runs against the server, new messages, notifications and task changes appear
  on their own. The server keeps a small push stream open per tab (`GET /api/live`, Server-Sent Events) and says
  "something changed" after every successful write; the tab then re-fetches its own snapshot. The message carries
  no data, only a counter. If the stream cannot connect (some proxies, a network drop) the tab falls back to checking
  every 5 seconds while it is visible, and with the stream up it still makes a slow check once a minute as a safety net.
  Refreshes are silent and only change the screen when the data changed, so open windows and typed text are untouched.
  Limits: the push hub lives in one server process (run one copy of the server); behind a reverse proxy, response
  buffering must be off for `/api/live` (the server already sends `X-Accel-Buffering: no` for nginx).
  Tuning: `LIVE_REFRESH_MS` / `SAFETY_REFRESH_MS` in `src/context/ApiContext.jsx`; heartbeat and per-user stream
  limit in `server/src/http/live.js`. Tests: `npm run test:live` (in `server/`) and `npm run test:api`.
- **Notifications** — a bell dropdown surfacing assignment, deadline,
  overdue, and mention notifications.
- **Dark mode**, responsive layout, and a collapsible sidebar.

## Folder architecture

```
src/
├── components/
│   ├── auth/             # Login/signup UI building blocks
│   │   ├── AuthShell.jsx
│   │   ├── ForgotPasswordModal.jsx
│   │   ├── ProtectedRoute.jsx
│   │   └── RoleTabs.jsx
│   ├── common/            # Generic, reusable UI primitives
│   │   ├── Badge.jsx / Button.jsx / Modal.jsx / Switch.jsx
│   │   ├── ProgressBar.jsx / EmptyState.jsx / Tabs.jsx
│   ├── layout/             # App shell
│   │   ├── AppLayout.jsx / Sidebar.jsx / Topbar.jsx / NotificationsBell.jsx
│   ├── dashboard/          # Dashboard-only widgets
│   │   ├── StatsCards.jsx / PriorityBreakdown.jsx / UpcomingDeadlines.jsx
│   │   ├── GettingStarted.jsx / RecentActivity.jsx / ProjectsOverview.jsx
│   ├── tasks/               # Task Workspace
│   │   ├── FilterBar.jsx / KanbanBoard.jsx / KanbanColumn.jsx
│   │   ├── TaskCard.jsx / TaskListView.jsx / TaskModal.jsx
│   │   └── modal-tabs/       # DetailsTab, SubtasksTab, CommentsTab, FilesTab, TimeTab
│   ├── projects/             # Projects module
│   │   ├── ProjectCard.jsx / ProjectModal.jsx / GanttChart.jsx
│   └── settings/              # Profile & password modals
├── context/
│   ├── AuthContext.jsx    # Accounts, login/signup, roles, activation, reset
│   ├── TaskContext.jsx    # Tasks, projects, notifications, activity log, announcements
│   ├── ProfileContext.jsx
│   └── ThemeContext.jsx
├── data/mockData.js       # Seed data + shared metadata (statuses, priorities…)
├── pages/                  # Dashboard, TasksPage, ProjectsPage, CalendarPage,
│                            # TeamPage, AdminPage, SettingsPage, SignupPage
└── App.jsx                 # Route table
```

## Notes

This is a **front-end-only mock**: accounts, tasks, projects, files, and
notifications all live in React state and reset on page reload. File
"uploads" never leave the browser, and password reset never sends a real
email. Wiring this UI to a real backend would mean replacing the contents
of `AuthContext`/`TaskContext` with API calls while keeping the same
shape of data and the same exposed actions.


## v16 changes
- Dashboard covers **My Workspace only**; **Reports** moved from the sidebar into every team (Team → Reports).
- Team task flow: Turn in → **To Review** (undo allowed) → admin **Approve → Done** or **Return → In Progress** with feedback. Files on turn-in are optional and viewable/downloadable.
- Admins can select all/some assigned tasks and delete them; auto-assign is balanced fairly (hand-picked tasks excluded); team **Gantt** view; deleted chat messages show “Message deleted”.
- Fixed: file picking in the turn-in dialog, profile **change password** (now really updates the account), invite links (open the homepage log-in popup).
- My Workspace tasks no longer have “Depends on” or comments.
- Overdue tasks trigger a warning pop-up (and a notification).
- New accounts get the guided tour once; the tour now highlights and points at the exact control.


## Data layer
Business logic lives in `src/api/` (framework-free JS, runs in Node). Run `npm run test:api` for the service tests. To check the app by hand, follow `docs/MANUAL_TEST_SCENARIOS.md`. Every automated browser scenario and check, with its last result, is listed in `docs/SYSTEM_TEST_SCENARIOS.md`. See `docs/API_CONTRACT.md` for the Express/MongoDB mapping.
