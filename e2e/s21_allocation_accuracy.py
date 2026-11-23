"""
System test (REAL stack: Express + MongoDB, built with VITE_API_URL=/api) for the accurate auto-allocation:
role from tags or title, skill level, real workload (hand-picked work counts), reasons shown, and the server owning
the decision. Four browser tabs: A = Maya (owner, backend), B = Ben (frontend, senior), D = Cleo (frontend, junior),
C = the site admin who sets roles and levels in the Users page. Team setup uses the app's own API for speed; every
screen the person would use (Users page, Create & assign form, Members tab) is checked in the UI.
"""
import os, sys, time; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
from datetime import date, timedelta
iso = lambda n: (date.today() + timedelta(days=n)).isoformat()

h = H('21-allocation-accuracy'); A = h.pg
B = h.ctx.new_page(); C = h.ctx.new_page(); D = h.ctx.new_page()
def use(pg): h.pg = pg
def api(pg, method, path, body=None):
    return pg.evaluate("""async ([m, p, b]) => { const t = sessionStorage.getItem('taskit.session');
        const r = await fetch('/api' + p, { method: m, headers: { Authorization: 'Bearer ' + t, 'X-Requested-With': 'taskit', 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
        return { status: r.status, json: await r.json().catch(() => null) }; }""", [method, path, body])
def snap(pg): return api(pg, 'GET', '/bootstrap')['json']['data']
def clear(pg):
    h.dismiss_popups()
    for _ in range(4):
        if pg.locator('[role=dialog]:has-text("Overdue"), [role=dialog]:has-text("Due today"), [role=dialog]:has-text("Due tomorrow")').count():
            pg.keyboard.press('Escape'); h.wait(300)
def tab(pg, name): pg.click(f'[role=tab]:has-text("{name}")'); h.wait(400)

# ---------------------------------------------------------------- the team (set up through the API)
use(A); h.signup('Maya Cruz', 'maya@x.com', first=True); h.login('maya@x.com')
group = api(A, 'POST', '/teams', {'name': 'Crew', 'description': 'x', 'visibility': 'public'})['json']['data']
proj = api(A, 'POST', '/projects', {'name': 'Launch', 'groupId': group['id']})['json']['data']
for pg, name, email in ((B, 'Ben Reyes', 'ben@x.com'), (D, 'Cleo Diaz', 'cleo@x.com')):
    use(pg); h.signup(name, email, first=True); h.login(email)
    api(pg, 'POST', '/teams/join', {'code': group['inviteCode']})
use(A)
for jr in snap(A)['joinRequests']: api(A, 'POST', f"/join-requests/{jr['id']}/approve")
people = {a['name']: a['id'] for a in snap(A)['accounts']}

# ---------------------------------------------------------------- the admin gives roles AND skill levels (Users page)
use(C); h.admin_signup(); h.nav('Users'); h.wait(600)
lvl = C.get_by_label('Skill level for Ben Reyes')
h.check('users: every member row has a Skill level picker next to Company role', lvl.count() == 1 and C.get_by_label('Company role for Ben Reyes').count() == 1)
h.check('users: the levels are Not set / Junior / Mid-level / Senior', lvl.locator('option').all_inner_texts() == ['Not set', 'Junior', 'Mid-level', 'Senior'], lvl.locator('option').all_inner_texts())
for who, role, level in (('Ben Reyes', 'Frontend Developer', 'Senior'), ('Cleo Diaz', 'Frontend Developer', 'Junior'), ('Maya Cruz', 'Backend Developer', 'Mid-level')):
    C.get_by_label(f'Company role for {who}').select_option(label=role); h.wait(400)
    C.get_by_label(f'Skill level for {who}').select_option(label=level); h.wait(500)
h.check('users: the level choice sticks after a refresh', (C.reload(), h.wait(2000), C.get_by_label('Skill level for Ben Reyes').evaluate("e => e.selectedOptions[0].text"))[2] == 'Senior')

# ---------------------------------------------------------------- the owner's Members tab and the form (live, no reload of Maya's tab)
use(A); h.nav('Team'); A.get_by_label('Open Crew').click(); h.wait(600); tab(A, 'Members')
ok = False
for _ in range(60):
    if 'Frontend Developer · Senior' in h.body() and 'Frontend Developer · Junior' in h.body(): ok = True; break
    time.sleep(0.2)
h.check('members: each person\'s company role and skill level are shown (arrived live)', ok, h.body()[:300])
tab(A, 'Assign task'); A.get_by_text('Launch').first.click(); h.wait(500)
A.locator('[role=tab]:has-text("Create & assign")').click(); h.wait(400)
h.check('form: every task row has a Priority picker (Low / Medium / High)', A.locator('select[aria-label="Task 1 priority"] option').all_inner_texts() == ['Low', 'Medium', 'High'])

# role preview under each row: a preview of what the server will do
A.fill('input[aria-label="Task 1 title"]', 'Fix the React navbar'); h.wait(300)
hint1 = A.locator('[data-testid=role-hint-1]').inner_text()
h.check('preview: a role is read from the TITLE ("react")', 'Frontend Developer' in hint1 and 'title mentions "react"' in hint1 and '2 members qualify' in hint1, hint1)
A.fill('input[aria-label="Task 2 title"]', 'Audit books'); A.fill('input[aria-label="Task 2 tags"]', 'finance'); h.wait(300)
hint2 = A.locator('[data-testid=role-hint-2]').inner_text()
h.check('preview: a tag nobody holds says it will be left unassigned', 'nobody has that role' in hint2 and 'left unassigned' in hint2, hint2)
A.fill('input[aria-label="Task 3 title"]', 'Write docs') if A.locator('input[aria-label="Task 3 title"]').count() else (A.locator('button:has-text("Add another")').first.click(), h.wait(200), A.fill('input[aria-label="Task 3 title"]', 'Write docs'))
h.wait(300)
h.check('preview: no role words means shared by workload', 'No role detected' in A.locator('[data-testid=role-hint-3]').inner_text())
A.fill('input[aria-label="Task 2 title"]', ''); A.fill('input[aria-label="Task 2 tags"]', ''); A.fill('input[aria-label="Task 3 title"]', ''); A.fill('input[aria-label="Task 1 title"]', ''); h.wait(200)

# ---------------------------------------------------------------- one batch exercising role, level, tie-break and workload
rows = [('Fix the React navbar', '', 'medium', None), ('Polish footer', 'frontend', 'medium', None), ('Rebuild checkout', 'frontend', 'high', None),
        ('Audit books', 'finance', 'medium', None), ('Write docs', '', 'medium', None)]
for i, (title, tags, prio, _) in enumerate(rows, start=1):
    if A.locator(f'input[aria-label="Task {i} title"]').count() == 0:
        A.locator('button:has-text("Add another")').first.click(); h.wait(200)
    A.fill(f'input[aria-label="Task {i} title"]', title); A.fill(f'input[aria-label="Task {i} due date"]', iso(30 + i))
    if tags: A.fill(f'input[aria-label="Task {i} tags"]', tags)
    A.select_option(f'select[aria-label="Task {i} priority"]', prio)
A.click('button:has-text("Assign tasks")'); h.wait(2000)
body = h.body()
why = A.locator('ul[aria-label="Why each task went where it did"]').inner_text()
h.check('result: a reason is shown for every assigned task', all(t in why for t in ('Fix the React navbar', 'Polish footer', 'Rebuild checkout', 'Write docs')) and 'lightest workload' in why, why)
h.check('result: the reason for the high-priority task mentions the skill level it needed', 'needs Mid-level or above' in why, why)
h.check('result: the title-based role is explained', 'title mentions "react"' in why, why)
h.check('result: the task needing a role nobody has is reported as unassigned', 'left unassigned' in body and 'Audit books' in body and 'Nobody has the Accountant / Finance role' in body, body[-500:])

tasks = {t['title']: t for t in snap(A)['tasks']}
ben, cleo, maya = people['Ben Reyes'], people['Cleo Diaz'], people['Maya Cruz']
h.check('allocation: role read from the title -> the senior frontend developer (most spare capacity)', tasks['Fix the React navbar']['assigneeId'] == ben)
h.check('allocation: a tie in load goes to whoever was assigned least recently (Cleo)', tasks['Polish footer']['assigneeId'] == cleo)
h.check('allocation: a high-priority task skips the junior and goes to the senior', tasks['Rebuild checkout']['assigneeId'] == ben)
h.check('allocation: a role named by a TAG that nobody holds -> left unassigned', tasks['Audit books']['assigneeId'] in (None, ''))
h.check('allocation: with no role needed, the least-loaded person (Maya) takes it', tasks['Write docs']['assigneeId'] == maya)
h.check('stored: the server marked the automatic ones and kept the reason in the history', tasks['Fix the React navbar']['autoAssigned'] is True and 'Auto-assigned to Ben Reyes' in str(tasks['Fix the React navbar']['history']) and tasks['Audit books']['autoAssigned'] is False)

# ---------------------------------------------------------------- real workload: hand-picked work counts
tab(A, 'Assign task'); A.get_by_text('Launch').first.click(); h.wait(500)
A.locator('[role=tab]:has-text("Create & assign")').click(); h.wait(400)
for i in (1, 2, 3):
    if A.locator(f'input[aria-label="Task {i} title"]').count() == 0:
        A.locator('button:has-text("Add another")').first.click(); h.wait(200)
    A.fill(f'input[aria-label="Task {i} title"]', f'Ben extra {i}'); A.fill(f'input[aria-label="Task {i} due date"]', iso(40 + i))
    A.select_option(f'select[aria-label="Task {i} priority"]', 'high'); A.select_option(f'select[aria-label="Task {i} assignee"]', label='Ben Reyes')
A.click('button:has-text("Assign tasks")'); h.wait(1800)
h.check('hand-picked: tasks picked by hand go to the chosen person and are not marked automatic',
        all(t['assigneeId'] == ben and t['autoAssigned'] is False for t in snap(A)['tasks'] if t['title'].startswith('Ben extra')))
tab(A, 'Assign task'); A.get_by_text('Launch').first.click(); h.wait(500)
A.locator('[role=tab]:has-text("Create & assign")').click(); h.wait(400)
A.fill('input[aria-label="Task 1 title"]', 'Another frontend job'); A.fill('input[aria-label="Task 1 tags"]', 'frontend'); A.fill('input[aria-label="Task 1 due date"]', iso(50))
A.click('button:has-text("Assign tasks")'); h.wait(1800)
t2 = {t['title']: t for t in snap(A)['tasks']}
h.check('workload: Ben is now busy with hand-picked work, so the next frontend job goes to Cleo', t2['Another frontend job']['assigneeId'] == cleo)

# ---------------------------------------------------------------- the server owns the decision
use(B)
r = api(B, 'POST', f"/projects/{proj['id']}/team-tasks", {'rows': [{'title': 'Sneaky', 'dueDate': iso(5)}]})
h.check('server: a plain member cannot use the allocation endpoint (403)', r['status'] == 403, r['status'])
use(A)
r = api(A, 'POST', '/tasks', {'input': {'title': 'Faked auto', 'dueDate': iso(5), 'projectId': proj['id'], 'assigneeId': ben, 'autoAssigned': True}})
h.check('server: a request cannot claim an assignment was automatic', r['json']['data']['autoAssigned'] is False, r['json'])

for p in (B, C, D):
    try: p.close()
    except Exception: pass
use(A); h.done()
