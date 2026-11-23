# Manual test scenarios

Things to check yourself in the browser: the team Public/Private switch, company roles, role-tag auto-assignment and
live updates. Tick each box as you go. If something fails, note the **scenario number and step** and what you saw.
(The automated version of these is `e2e/s19_roles_visibility_live.py`; this list is for human eyes.)

**Timing rule used below:** with live updates working, a change made in one tab shows in the other **within about
1–2 seconds, with no refresh**. If the live connection is blocked, it falls back to checking every 5 seconds, so
"within ~6 seconds" is still acceptable but means the fallback is running (see scenario 12).

---

## 0. Setup (Windows / PowerShell)

Two terminals, as in `server/README.md`:

```powershell
# Terminal 1: the server (needs server/.env: MONGODB_URI, NODE_ENV=development, COOKIE_SECURE=false, ADMIN_INVITE_CODE)
cd server
npm install
npm run dev

# Terminal 2: the website, from the project root
npm install
$env:VITE_API_URL = "/api"
npm run dev
```

Open **http://localhost:5173**.

**Three tabs, one browser.** Each tab keeps its own login, so use three *new* tabs (type the address; do not use
"Duplicate tab"):

| Tab | Who | How to get the account |
|---|---|---|
| **A** | Maya, the team owner | Sign up `maya@test.com`, then log in |
| **B** | Ben, a member | Sign up `ben@test.com`, then log in |
| **C** | the site admin | Open `http://localhost:5173/?auth=admin`, choose "Create an admin account", use your `ADMIN_INVITE_CODE`, then log in |

Use a fresh database, or new email addresses, so old data does not confuse the results. Keep tabs A and B visible side
by side (two windows) when you can, so you can see B change while you act in A.

---

## 1. Owner switches a team Public / Private from the team card

1. **Tab A:** *Team* → *Create team*, name `Crew`, create it. Go back to *Team* so you see the team **card**.
2. - [ ] The card has a **Public | Private** switch at the bottom, and **Public** is highlighted for a new team.
3. Click **Private**.
   - [ ] Private highlights immediately (no page change, no popup).
4. Refresh the page (F5).
   - [ ] The card still says **Private** (it was saved on the server).
5. Click **Public** again.
   - [ ] Public highlights.

## 2. The same setting inside the team

1. **Tab A:** open `Crew` → **Members** tab → scroll to **About this team**.
2. - [ ] **Visibility** shows the same Public | Private switch, with the current value highlighted, and a sentence
     under it explaining what it means.
3. Click the other option.
   - [ ] It changes at once. There is no "Save changes" step for visibility.
4. Go back to *Team*.
   - [ ] The card shows the same value you just chose (both places always agree).
5. In **About this team** change the team **name** to `Crew HQ` and press **Save changes**, then change it back to `Crew`.
   - [ ] Renaming does **not** change Public/Private.

## 3. A member cannot change it

(Do scenario 5 first so Ben is a member, then come back.)

1. **Tab B:** *Team* → *My teams*.
   - [ ] Ben's `Crew` card shows **Public** (or Private) as plain text with a small icon, and **no switch**.
2. Open `Crew` → **Members** tab.
   - [ ] The Visibility control in *About this team* is not offered to Ben (only the owner edits it).

## 4. Live: the Discover list follows the switch

1. **Tab B (Ben, not yet a member):** *Team* → **Discover** tab. Leave it open; do not touch it again.
   - [ ] `Crew` is listed with a **Request to join** button (while the team is Public).
2. **Tab A:** switch `Crew` to **Private** on its card.
   - [ ] Within ~2 s the team **disappears from Ben's Discover list** with no refresh.
3. **Tab A:** switch back to **Public**.
   - [ ] Within ~2 s the team **reappears** in Ben's Discover list.

## 5. Live: join request and approval

1. **Tab B:** click **Request to join** on `Crew`.
   - [ ] The button changes to "Request pending".
2. **Tab A** (on the *Team* page, not inside the team):
   - [ ] Within ~2 s the `Crew` card shows a badge like **1 join request**, no refresh needed.
3. **Tab A:** open `Crew` → **Members** → **Approve** Ben.
4. **Tab B** (still on Discover):
   - [ ] Within ~2 s the *My teams* tab count goes to **1**. Open *My teams* and the `Crew` card is there.

## 6. Admin gives people a company role

1. **Tab C (admin):** *Users* page.
   - [ ] Every member row has a **Company role** dropdown. (Admin accounts show "—" instead.)
2. Open Ben's dropdown.
   - [ ] Roles are grouped under headings: **Software development, Simple business, Creative & media,
     Engineering & construction, Education, Healthcare**, plus **No role set** at the top (31 roles in total).
3. Set **Ben → Frontend Developer** and **Maya → Backend Developer**.
   - [ ] Each choice sticks (refresh the Users page: still set).
4. **Tab A**, inside `Crew` → **Members** tab (do not refresh):
   - [ ] Within ~2 s each person's line shows their job title and company role, e.g.
     `… · Frontend Developer`.
5. **Tab B** (Ben): open *Profile & settings*.
   - [ ] Ben can edit his own free-text **title**, but there is **no way for him to set his Company role**
     (only the admin can).
6. Optional: in Tab C set Ben back to **No role set**.
   - [ ] The role disappears from the Members tab in Tab A by itself.

## 7. Create & assign: tags and the role hint

1. **Tab A:** `Crew` → **Projects** → **New project** `Launch`.
2. **Tab A:** **Assign task** → choose `Launch` → **Create & assign** tab.
3. - [ ] Every task row has a **Tags** box next to the title.
4. - [ ] Under the intro text you see **Role tags in this team:** with `frontend` Frontend Developer (1) and
     `backend` Backend Developer (1). (Before roles were set it said "No member has a company role yet".)

## 8. Role-tag auto-assignment

In the **Create & assign** form fill four rows (leave **Assign to** on **Auto** for all of them) and click **Assign tasks**:

| Title | Tags |
|---|---|
| `Fix navbar` | `frontend` |
| `Build API` | `backend` |
| `Pay invoices` | `finance` |
| `Write docs` | *(empty)* |

Then check:

- [ ] The result panel says the tasks were assigned **and** shows a yellow note that **`Pay invoices`** was **left
      unassigned — needs Accountant / Finance** (nobody has that role).
- [ ] **Member tasks** tab: `Fix navbar` is assigned to **Ben**, `Build API` to **Maya**, `Pay invoices` to
      **Unassigned**, and `Write docs` to **either** of them.
- [ ] Tags `frontend`, `backend`, `finance` are shown on those tasks.
- [ ] **Tab B** (Ben) → `Crew` → **Projects** → `Launch`: Ben sees `Fix navbar` and does **not** see `Build API`
      or `Pay invoices`. (He may also see `Write docs`.)

More variations (do any you like):

- [ ] Tag typed as `Frontend`, `#frontend` or ` frontend ` (capitals, `#`, spaces) still goes to Ben.
- [ ] Tags `frontend, backend` on one task: goes to Ben **or** Maya.
- [ ] A task with tag `urgent` only (not a role): shared among everyone, like an untagged task.
- [ ] A row where you **pick Ben by hand** in "Assign to" and tag it `backend`: it still goes to Ben (hand-picked
      always wins; the tag is just stored).
- [ ] **Balancing:** create 4 untagged tasks on Auto. Together with the earlier auto tasks, Ben's and Maya's totals
      end up **within 1 of each other** (the person with fewer auto tasks gets the next one).
- [ ] Optional: add a third person (Cleo), have the admin give her **Frontend Developer** too, and create 4 tasks
      tagged `frontend`: they go only to Ben and Cleo (Cleo, who has fewer, gets the first one), their totals end
      up within 1 of each other, and Maya gets none of them.

## 9. Live: new assignment reaches the member

1. **Tab B (Ben):** open `Crew` → **Projects** → `Launch` and leave it open. Look at the **bell** icon.
2. **Tab A:** *Assign task* → create one new task `Hotfix login`, tag `frontend`, Auto.
   - [ ] Within ~2 s Ben's `Launch` list shows `Hotfix login` without a refresh.
   - [ ] Ben's **bell** shows a new unread notification: "Maya Cruz assigned you to "Hotfix login"".

## 10. Live: chat

1. **Tab B:** `Crew` → **Chat** tab. **Tab A:** `Crew` → **Chat**.
2. **Tab A:** send `Hello Ben`.
   - [ ] It appears in Ben's chat within ~2 s, no refresh.
3. **Tab B:** reply `Hi Maya`.
   - [ ] It appears in Maya's chat within ~2 s.
4. **Reading old messages (scroll test).** In Tab A send ~15 short messages so the chat scrolls. In **Tab B scroll
   up** to the oldest messages and stay there. Now send one more message from Tab A.
   - [ ] Ben's view **stays where he scrolled**; it does not jump to the bottom.
   - [ ] If Ben is already at the bottom when a message arrives, it **does** follow to the newest.
   - [ ] When Ben sends a message himself, his view goes to the bottom.

## 11. Nothing is interrupted while updates arrive

Do this while someone keeps making changes (e.g. send chat messages from Tab A every few seconds):

1. **Tab B:** start typing a long message in the chat box but **do not send it**.
   - [ ] New messages arrive, and your half-typed text and cursor stay exactly as they were.
2. **Tab B:** open a task window / popup, or the bell dropdown.
   - [ ] It stays open while updates arrive in the background.
3. **Tab B:** look at the page.
   - [ ] It never flashes, reloads, or jumps back to the top by itself.

## 12. Fallback when the live connection is blocked

1. **Tab B:** press **F12** → **Network** tab, filter `live`.
   - [ ] You see a request named **`live`** that stays **pending** (it is the always-open connection; that is normal).
2. Right-click that request → **Block request URL** (or set the Network throttling to *Offline* for a moment, then back).
   Reload Tab B.
3. **Tab A:** send a chat message.
   - [ ] It still arrives in Tab B, now within **about 5 seconds** (the timer fallback), still with no refresh.
4. Remove the block and reload Tab B.
   - [ ] Updates are back to ~1–2 s.

## 13. Hidden tab catches up

1. **Tab B:** switch to another browser tab for ~30 seconds.
2. **Tab A:** send two chat messages and create a task for Ben.
3. Switch back to **Tab B**.
   - [ ] The new messages and task are there within a second or two of returning.

## 14. Daily digest

The digest is **one summary entry per day in the notification bell**. The first time the app syncs on a new day (and
at once if you switch the digest on later that day) it counts your overdue tasks, tasks due today and tomorrow, tasks
due in the next 7 days, and today's calendar reminders. Nothing to report means no digest. It never pops up; it just
sits in the bell. **Only one digest is made per day, as a snapshot, so use a brand-new account for this test**: the
accounts from the earlier scenarios may already have today's digest.

1. **New tab D:** sign up and log in as a new person, **Dana** (`dana@test.com`). Do **not** create any task yet.
2. *Profile & settings* → **Notifications**.
   - [ ] **Daily digest** is a normal switch, **on by default**, with **no "Coming soon"** badge.
3. Turn **Daily digest OFF**.
4. Create these tasks in a new personal project (dates relative to today): one **overdue** (a past date), one **due
   today**, one **due tomorrow**, one **due in 5 days**, one **due in 30 days**, and one **due today that you then
   mark Done**. Also add a **calendar reminder for today**.
   - [ ] No "Daily digest" entry appears in the bell while the switch is off (the usual overdue / due-today notices
         still do).
5. Turn **Daily digest ON**, then open the **bell**.
   - [ ] Within a second or two a new **unread** entry appears:
         `Daily digest: 1 overdue, 1 due today, 1 due tomorrow, 1 more due in the next 7 days, 1 reminder today.`
         (the 30-day task and the finished task are **not** counted).
   - [ ] It did **not** pop up on its own; it only sits in the bell.
   - [ ] Clicking it opens the **Tasks** page.
6. Turn the switch **off and on again**.
   - [ ] There is still **only one** digest for today (no duplicates).
7. **Only your own tasks count.** Look at **Maya's** bell (Tab A).
   - [ ] Her digest, if she has one, never counts Dana's tasks.
8. **Site-wide switch.** Tab C (admin) → **System settings** → turn **Deadline & overdue alerts** off.
   - [ ] After that, **no new digests** are created for anyone (existing ones stay in the bell). Turn it back on afterwards.
9. **"Due-date reminders" is a separate switch.** In Dana's settings turn **Due-date reminders** off, leave Daily digest on.
   - [ ] The pop-up reminders stop, but the Daily digest still works.
10. **Next day (optional; needs a real day to pass or changing the computer clock):**
    - [ ] A new digest appears for the new day, and a digest older than 7 days disappears from the bell by itself.

## 15. Accurate auto-allocation (role, skill level, real workload)

Every task left on **Auto** is decided by the **server**, using: the role the task needs (from its tags, else the
words in its title), the skill level its size needs, and each person's real workload across all their open team tasks.
Every choice comes with a reason. This scenario needs **three team members**: Maya (owner), Ben and a new person,
**Cleo** (`cleo@test.com`, in a fourth tab; join `Crew` with the invite code and have Maya approve).

**Setup (Tab C, the admin, *Users* page).** Each person has two pickers now: **Company role** and **Level**.
- [ ] Each member row has a **Level** dropdown with **Not set, Junior, Mid-level, Senior** (admin rows show "—").
- Set **Ben = Frontend Developer + Senior**, **Cleo = Frontend Developer + Junior**, **Maya = Backend Developer + Mid-level**.
- [ ] After a refresh the choices are still there.
- [ ] **Tab A**, `Crew` → **Members** (no refresh): Ben shows `… · Frontend Developer · Senior` and Cleo `… · Frontend Developer · Junior`.

**The form (Tab A, `Crew` → Assign task → `Launch` → Create & assign).**
- [ ] Every row has a **Priority** picker (Low / Medium / High) next to Tags.
- [ ] Type the title `Fix the React navbar` (no tag): a grey line appears under the row, like *Looks like Frontend
      Developer work (title mentions "react"): 2 members qualify.*
- [ ] Type the title `Audit books` with tag `finance`: *Needs Accountant / Finance (tag "finance"), but nobody has that
      role: it will be left unassigned.*
- [ ] Type the title `Write docs` with no tag: *No role detected: shared by workload among everyone.*

**One batch.** Clear the rows and enter these (leave Assign to on **Auto — best fit**), then **Assign tasks**:

| Title | Tags | Priority |
|---|---|---|
| `Fix the React navbar` | | Medium |
| `Polish footer` | `frontend` | Medium |
| `Rebuild checkout` | `frontend` | **High** |
| `Audit books` | `finance` | Medium |
| `Write docs` | | Medium |

- [ ] A list **"Why each task went where it did"** appears, one line per assigned task, ending in "lightest workload".
- [ ] `Fix the React navbar` → **Ben** (role read from the title; the senior has the most spare capacity).
- [ ] `Polish footer` → **Cleo** (Ben and Cleo are tied on load, so it goes to whoever was assigned **least recently**).
- [ ] `Rebuild checkout` → **Ben**, and its line says **needs Mid-level or above** (a high-priority task skips the junior).
- [ ] `Audit books` → **Unassigned**, with a yellow note: *Nobody has the Accountant / Finance role*.
- [ ] `Write docs` → **Maya** (no role needed, so the least-loaded person takes it).
- [ ] Open `Fix the React navbar` → history shows **Auto-assigned to Ben (…reason…)**.

**Real workload: hand-picked work counts.**
1. Create three **High** tasks and set **Assign to = Ben** on each (`Ben extra 1`, `2`, `3`).
   - [ ] They go to Ben and are **not** marked as automatic.
2. Create one more task, title `Another frontend job`, tag `frontend`, on **Auto**.
   - [ ] It goes to **Cleo**: Ben is now busy with the hand-picked work, even though those tasks were not "auto".
3. **Removing work frees the person:** as the owner, delete `Ben extra 1`, `2` and `3`, then create another `frontend`
   task on **Auto**.
   - [ ] It can go to Ben again (his load dropped back down). (Finished work not counting as load is covered by the
         automated tests.)

**Other checks.**
- [ ] A role only *guessed from the title* that nobody holds (for example title `Pay supplier invoices`, no tag) is **not**
      left unassigned: it goes to the least-loaded person, and the reason says nobody has that role.
- [ ] Give Cleo the level **Senior** (admin) and repeat a **High** frontend task: it can now go to Cleo too.
- [ ] **Suspend** Cleo (admin, Users page) and create a `frontend` task on Auto: it goes to Ben (suspended people are skipped).
      Re-activate Cleo afterwards.
- [ ] **Tab B (Ben, a plain member)** has no **Assign task** tab at all; only team admins can create and assign team tasks.
- [ ] A task whose assignee you picked by hand always goes to that person, whatever their role or level.

## 16. Quick regression pass (things that should be unchanged)

- [ ] Sign out and in again in Tab B: you land on the same kind of page as before and the team is still there.
- [ ] Refresh Tab A while inside `Crew` → **Members**: you stay on that page (not sent to the homepage).
- [ ] Join by invite code still works (use *Join with code* from a fourth account).
- [ ] The owner can still regenerate the invite code (**New code**) and delete/leave a team as before.
- [ ] Phone-width window (narrow the browser): the team card's Public | Private switch and the **Open team →**
      link are still readable and tappable, and the Users page role dropdown is usable.
- [ ] Dark mode (if you use it): the switch and the yellow "left unassigned" note are readable.

---

## If something fails

Send me: the **scenario and step number**, what you expected, what you saw, and (if it is a "live" scenario) whether
the `live` request in F12 → Network looked **pending** (working) or **red/failed**. For a server error also copy the
last lines of **Terminal 1** (the server window).

### Known limits (not bugs)

- The server runs live updates in one process; run a single copy of the server.
- A notification that appears only because a **due date is near** is created when someone's data loads, so it can
  take up to a minute to appear rather than being instant.
- A task tagged with a role that **nobody** has is left **Unassigned** on purpose (and reported), so it never lands
  on the wrong person.
