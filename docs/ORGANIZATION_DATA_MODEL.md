# Organization module: data model and migration plan (Step 2)

Status: schemas, indexes, migration script and tests are in the repo. Nothing in the running app uses them yet:
`models.js`, `repo.js` and the services still use `groups`. They are switched over in Step 3, together with the services.
**Do not run the migration on real data until Steps 3 to 5 are merged**, because the old v60 server cannot run on migrated data.

## Decisions to confirm (defaults used)

| # | Decision | Default used |
|---|----------|--------------|
| 1 | Approval chain | Member -> Assistant -> Unit Leader -> parent unit's Leader -> ... -> top-level unit's Leader (final). Managers only handle the deadline queue. |
| 2 | Assistant return cap | 2 Assistant returns per item (`MAX_ASSISTANT_RETURNS`), then only the Leader can return it. |
| 3 | Deadline override | Task past its due date and still not approved at its current level: goes to the Manager queue, logged once as `deadline_override`. |
| 4 | Anonymous ratings | Score 1-5 per unit per month. No evaluator id, no timestamp. A keyed hash (`raterKey`) only stops a second rating by the same person. This is weaker than "no link at all": anyone holding the database AND the server secret could test guesses. Averages should be shown only when several managers rated. |
| 5 | Handoff route | An ordered list of units. The sending Leader submits; the receiving Leader accepts or returns it to the sender. A handoff moves one task. |
| 6 | Old team features | Kept: invite codes, join requests, public/private. Replaced by the unit tree: custom job roles and random auto-assignment (their data is preserved under `organizations.legacy` and on tasks, not deleted). |
| 7 | Migration mapping | See "Migration mapping" below. One person can belong to several organizations. |
| 8 | Owner account deleted | Longest-serving Manager inherits (service logic, Step 3). |
| 9 | Site admin | Sees structure, projects, tasks and reviews and can disband an organization; never evaluation data or chat text. |
| 10 | URL | `/organization`, with `/team` redirecting to it (Step 4). Old notification links keep working through that redirect, so notifications are not rewritten. |

Two choices that go beyond the original data list, please confirm:
- **`orgMembers` collection** (one row per person per organization) instead of member arrays on the organization. It lets the database itself guarantee one Owner per organization and one Leader per unit, and makes promotions a one-row change.
- **Two role columns:** `role` (`owner` / `manager` / `member`, organization-wide) and `unitRole` (`leader` / `assistant` / `member`, inside one unit). This lets the Owner also lead a unit, as the migration needs when a group had no other admin.

## New collections (`server/src/db/organizationModels.js`)

| Collection | Purpose | Key fields |
|-----------|---------|------------|
| `organizations` | Replaces `groups`. Same `_id`, so every old `groupId` is a valid `orgId`. | name, description, visibility, ownerId, inviteCode (unique), legacy |
| `orgmembers` | Person in an organization. | orgId, userId, role, unitId, unitRole, joinedAt |
| `orgunits` | Recursive unit tree. | orgId, parentId (null = top level), name, nameKey, path (ancestor ids), depth (max 7) |
| `reviews` | Append-only review log. | orgId, taskId, seq, action, authorId, actorId, actorRole, unitId, fromHolderId, toHolderId, handoffId, note |
| `orgevaluationfacts` | System-computed numbers per unit and month. | tasksAssigned, tasksApproved, tasksOnTime, tasksLate, returns, deadlineOverrides, avgApprovalHours |
| `orgratings` | Anonymous manager ratings. | orgId, unitId, period, raterKey, score |
| `orghandofftemplates` | Owner-defined route. | orgId, name, steps[{unitId}], active |
| `orghandoffs` | One task moving along a route. | templateId, taskId, stepIndex, fromUnitId, toUnitId, state |

Review `action` values: `submit`, `withdraw`, `approve`, `return`, `escalate`, `deadline_override`, `handoff_accept`, `handoff_return`.

## Indexes that enforce rules

| Rule | Index |
|------|-------|
| One Owner per organization | unique `orgmembers {orgId}` where `role = 'owner'` |
| One Leader per unit | unique `orgmembers {orgId, unitId}` where `unitRole = 'leader'` |
| A person appears once per organization | unique `orgmembers {orgId, userId}` |
| Unit names unique among siblings | unique `orgunits {orgId, parentId, nameKey}` |
| Two people cannot act on the same review step | unique `reviews {taskId, seq}` (the second insert fails) |
| One rating per rater, unit and month | unique `orgratings {orgId, unitId, period, raterKey}` |
| One facts row per unit and month | unique `orgevaluationfacts {orgId, unitId, period}` |

Append-only: `reviews` and `orgratings` refuse update, replace and delete through Mongoose. Deleting is allowed only with the explicit `{ purge: true }` option (used when an organization or account is removed). This guards code that uses these models; it does not stop someone with direct database access. `reviews` also rejects `approve` / `return` / `escalate` when the actor is the author (the service checks this first).

## Changes to existing collections (applied to `models.js` in Step 3)

| Collection | Change |
|-----------|--------|
| `tasks` | `groupId` -> `orgId`. New: `unitId`, `reviewState` (`none` / `submitted` / `returned` / `approved`), `reviewHolderId`, `reviewReturnCount`, `deadlineOverride`. `turnIn`, `turnInDraft`, `returned`, `previousTurnIns`, `roleId`, `roleName`, `autoAssigned` are kept. Indexes: `{orgId, unitId, reviewState}`, `{reviewState, dueDate}`. |
| `projects` | `groupId` -> `orgId`. New: `unitIds[]` (units the project is assigned to; index). |
| `messages` | `groupId` -> `orgId`. New: `unitId` (null = organization-wide chat). Index `{orgId, unitId, _id: -1}` replaces `{groupId, _id: -1}`. |
| `teamAnnouncements` | `groupId` -> `orgId`. |
| `joinRequests` | `groupId` -> `orgId`. New: `unitId` (null). `roleId` kept. Unique `{orgId, accountId}`. |
| `roleChanges` | `groupId` -> `orgId`. Reused for promotion proposals: new `toRole`, `unitId`, `status` (`open` / `approved` / `dismissed` / `legacy`), `decidedById`, `decidedAt`. Old job-role proposals become `legacy` and are ignored. Unique `{orgId, accountId}` where `status = 'open'`. |
| `activity` | `groupId` -> `orgId`; `scope: 'team'` -> `'organization'`. |
| `users`, `sessions`, `files`, `notifications`, `reminders` | Unchanged. |

## Migration mapping

- Each group becomes an organization with the same `_id`; its roles, role assignments and admin list are saved under `legacy`.
- Each group gets one top-level unit with the group's name, holding everyone.
- The group owner becomes **Owner**. The first other admin becomes the unit's **Leader** (the owner leads it only if there is no other admin). Further admins become **Assistants**. Everyone else is a **Member**.
- Task review state: handed in and waiting -> `submitted` (holder = the Leader); approved -> `approved`; sent back -> `returned` (holder = the assignee); everything else `none`.
- Old indexes that mention `groupId` are dropped before the rename. Otherwise a leftover unique index on `(groupId, accountId)` would treat every renamed document as `groupId = null` and reject the second one.
- The old `groups` collection is not touched. Drop it yourself after you have checked the app.

## Running the migration (when Steps 3 to 5 are merged)

**1. Back up first. The migration changes data in place and cannot undo itself.**
- Back up the database with `mongodump --uri="<your MONGODB_URI>" --out=backup-before-organizations` (MongoDB Database Tools). Atlas free (M0) clusters have no snapshot backups, so `mongodump` is required there; paid clusters can also use an Atlas snapshot.
- Back up the code: the GitHub repo's first commit is v60, and keep `taskit-task-manager-v60.zip` in Drive.

**2. Stop the server.**

**3. Dry run** (changes nothing). Run from the `server` folder, which needs a `.env` with `MONGODB_URI` (Node 20.6 or newer):
```
cd server
npm run migrate:orgs
```

**4. Apply** (from the same folder):
```
npm run migrate:orgs -- --apply --i-have-a-backup
```
It prints what it created and renamed, then verifies: no document still has `groupId`, every `orgId` matches an organization, every organization task has a unit. If verification fails it writes no marker and exits with an error. Running it again after success does nothing.

**5. Roll back** (if something looks wrong): stop the server and restore the backup, for example `mongorestore --uri="<your MONGODB_URI>" --drop backup-before-organizations`.

## Tests

- `npm run test:orgmodels` (server folder): schemas, indexes, append-only guard, self-review backstop, and the migration planner. No database needed.
- `npm run test:migration` (server folder): seeds v60-shaped data in a throwaway database and runs the real script. Needs a real MongoDB server in `MONGODB_URI`; it only touches its own throwaway database, `taskit_migration_test`, and drops it at the end. It also checks that the database really refuses a second Owner or a second Leader.
