"""
System test (REAL stack: Express + MongoDB, built with VITE_API_URL=/api; see run_against_server.sh) for the team
visibility switch, company roles, role-tag auto-assignment and live (push) updates.
Three browser tabs at once: A = Maya (team owner), B = Ben (member), C = the site admin. Nobody reloads B or C: the
point is that changes made in one tab show up in the others on their own.
"""
import os, sys, time, json; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
from datetime import date, timedelta
d = lambda n: (date.today() + timedelta(days=n)).isoformat()

h = H('19-roles-visibility-live'); A = h.pg
B = h.ctx.new_page(); C = h.ctx.new_page()
live_requests = []
for name, p in (('A', A), ('B', B), ('C', C)):
    p.on('request', lambda r, n=name: live_requests.append(n) if r.url.endswith('/api/live') else None)

NO_LIVE = bool(os.environ.get('E2E_NO_LIVE'))   # E2E_NO_LIVE=1: block the push stream, to test the timer fallback
if NO_LIVE:
    for p in (A, B, C): p.route('**/api/live', lambda route: route.abort())
def use(pg): h.pg = pg
def until(fn, secs=8.0):
    """Waits for fn() to become true; returns (ok, seconds it took)."""
    t0 = time.time()
    while time.time() - t0 < secs:
        try:
            if fn(): return True, time.time() - t0
        except Exception: pass
        time.sleep(0.1)
    return False, time.time() - t0
def snapshot(pg):
    return pg.evaluate("""async () => { const t = sessionStorage.getItem('taskit.session');
        const r = await fetch('/api/bootstrap', { headers: { Authorization: 'Bearer ' + t, 'X-Requested-With': 'taskit' } });
        return (await r.json()).data; }""")
def tab(pg, name): pg.click(f'[role=tab]:has-text("{name}")'); h.wait(400)
def toggle(pg): return pg.locator('[role=group][aria-label="Team visibility"]').first
def pressed(pg, label): return toggle(pg).get_by_role('button', name=label).get_attribute('aria-pressed') == 'true'
FAST = 12.0 if NO_LIVE else 2.5   # seconds. The fallback timer is 5 s, so beating 2.5 s means the server PUSHED the change.

# ---------------------------------------------------------------- Maya creates a team; the owner switch on its card
use(A); h.signup('Maya Cruz', 'maya@x.com', first=True); h.login('maya@x.com')
h.nav('Team'); A.click('[data-tour=team-create]'); h.wait(300)
A.fill('#grp-name', 'Crew'); A.fill('#grp-desc', 'Our crew'); A.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(900)
h.nav('Team'); h.wait(500)
h.check('card: the owner gets a Public/Private switch on the team card', toggle(A).count() == 1)
h.check('card: a new team starts Public', pressed(A, 'Public') and not pressed(A, 'Private'))

# ---------------------------------------------------------------- Ben, in his own tab, watching Discover
use(B); h.signup('Ben Reyes', 'ben@x.com', first=True); h.login('ben@x.com')
h.nav('Team'); tab(B, 'Discover')
h.check('discover: Ben sees the public team', B.locator('button:has-text("Request to join")').count() == 1)
B.evaluate("window.__noReload = true")
h.check('live: Ben\'s tab opened the live stream' if not NO_LIVE else 'fallback: the stream is blocked in this run', ('B' in live_requests) != NO_LIVE or NO_LIVE, live_requests)

# owner flips it to Private on the card -> it saves, and Ben's Discover list drops it WITHOUT a reload
use(A); toggle(A).get_by_role('button', name='Private').click()
ok, secs = until(lambda: pressed(A, 'Private'))
h.check('card: switching to Private takes effect at once', ok)
ok, secs = until(lambda: B.locator('button:has-text("Request to join")').count() == 0, 8)
h.check(f'live: Ben\'s Discover list drops the team by itself ({secs:.1f}s)', ok and secs < FAST, round(secs, 1))
A.reload(); h.wait(2500)
h.check('card: Private survives a page reload (saved on the server)', pressed(A, 'Private'))
toggle(A).get_by_role('button', name='Public').click()
ok, secs = until(lambda: B.locator('button:has-text("Request to join")').count() == 1, 8)
h.check(f'live: switching back to Public shows it to Ben again ({secs:.1f}s)', ok and secs < FAST, round(secs, 1))
h.check('live: Ben\'s tab was never reloaded', B.evaluate("window.__noReload === true"))

# ---------------------------------------------------------------- join request shows up live for the owner
use(B); B.locator('button:has-text("Request to join")').first.click(); h.wait(500)
use(A); h.nav('Team'); h.wait(300)
ok, secs = until(lambda: 'join request' in h.body().lower(), 6)
h.check('live: the owner\'s team card shows the join request', ok, h.body()[:200])
A.get_by_label('Open Crew').click(); h.wait(500); tab(A, 'Members')
A.locator('li:has-text("Ben Reyes")').filter(has=A.locator('button:has-text("Approve")')).first.locator('button:has-text("Approve")').click(); h.wait(600)
h.check('members: Ben approved', A.get_by_label('Promote Ben Reyes to admin').count() == 1)

# Ben (still on Discover, never reloaded) becomes a member; a member gets NO switch on the card
use(B); ok, secs = until(lambda: B.locator('[role=tab]:has-text("My teams")').inner_text().strip().endswith('1'), 8)
tab(B, 'My teams')
h.check('live: Ben\'s My teams now lists the team', B.get_by_label('Open Crew').count() == 1)
h.check('card: a plain member sees Public/Private as text, with no switch', toggle(B).count() == 0 and 'Public' in B.get_by_label('Open Crew').locator('xpath=..').inner_text())

# ---------------------------------------------------------------- a team project, and the Create & assign form with no roles yet
use(A); tab(A, 'Projects'); A.locator('button:has-text("New project")').first.click(); h.wait(300)
A.fill('#proj-name', 'Launch'); A.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(700)
tab(A, 'Assign task'); A.get_by_text('Launch').first.click(); h.wait(500)
A.locator('[role=tab]:has-text("Create & assign")').click(); h.wait(400)
h.check('assign form: says no member has a company role yet', 'No member has a company role yet' in h.body())
h.check('assign form: every task row has a Tags field', A.locator('input[aria-label="Task 1 tags"]').count() == 1)

# Ben opens the project now, so we can watch his task list fill in by itself
use(B); B.get_by_label('Open Crew').click(); h.wait(500); tab(B, 'Projects'); B.get_by_text('Launch').first.click(); h.wait(500)
B.evaluate("window.__noReload2 = true")

# ---------------------------------------------------------------- the site admin gives the roles (tab C)
use(C); h.admin_signup(); h.nav('Users'); h.wait(500)
sel_ben = C.get_by_label('Company role for Ben Reyes'); sel_maya = C.get_by_label('Company role for Maya Cruz')
h.check('users: the admin sees a Company role picker per member', sel_ben.count() == 1 and sel_maya.count() == 1)
opts = sel_ben.locator('option').all_inner_texts()
groups = sel_ben.locator('optgroup').evaluate_all("els => els.map(e => e.label)")
h.check('users: roles are grouped by kind of company', all(g in groups for g in ['Software development', 'Simple business', 'Healthcare']), groups)
h.check('users: the list has the expected roles', 'Frontend Developer' in opts and 'Accountant / Finance' in opts and 'Nurse' in opts and len(opts) >= 31, len(opts))
sel_ben.select_option(label='Frontend Developer'); h.wait(500); sel_maya.select_option(label='Backend Developer'); h.wait(800)
h.check('users: the choice sticks', sel_ben.evaluate("e => e.selectedOptions[0].text") == 'Frontend Developer')

# roles reach the others live
use(A)
ok, secs = until(lambda: 'Role tags in this team' in h.body() and 'frontend' in h.body() and 'backend' in h.body(), 8)
h.check(f'live: the owner\'s assign form now lists the role tags ({secs:.1f}s)', ok, h.body()[-400:])
tab(A, 'Members')
ok, secs = until(lambda: 'Frontend Developer' in h.body() and 'Backend Developer' in h.body(), 6)
h.check('members: everyone\'s company role is shown to the team', ok)

# ---------------------------------------------------------------- role-tag auto-assignment
tab(A, 'Assign task'); A.get_by_text('Launch').first.click(); h.wait(500)
A.locator('[role=tab]:has-text("Create & assign")').click(); h.wait(400)
rows = [('Fix navbar', 'frontend'), ('Build API', 'backend'), ('Pay invoices', 'finance'), ('Write docs', '')]
for i, (title, tags) in enumerate(rows, start=1):
    if A.locator(f'input[aria-label="Task {i} title"]').count() == 0:
        A.locator('button:has-text("Add another"), button:has-text("Add task")').first.click(); h.wait(200)
    A.fill(f'input[aria-label="Task {i} title"]', title); A.fill(f'input[aria-label="Task {i} due date"]', d(5 + i))
    if tags: A.fill(f'input[aria-label="Task {i} tags"]', tags)
A.click('button:has-text("Assign tasks")'); h.wait(1500)
body = h.body()
h.check('assign: reports tasks left unassigned (nobody has the Finance role)', 'left unassigned' in body and 'Pay invoices' in body and 'Accountant / Finance' in body, body[-500:])

snap = snapshot(A)
people = {a['name']: a['id'] for a in snap['accounts']}
by_title = {t['title']: t for t in snap['tasks']}
h.check('assign: "frontend" task went to the Frontend Developer (Ben)', by_title['Fix navbar']['assigneeId'] == people['Ben Reyes'] and by_title['Fix navbar']['autoAssigned'])
h.check('assign: "backend" task went to the Backend Developer (Maya)', by_title['Build API']['assigneeId'] == people['Maya Cruz'] and by_title['Build API']['autoAssigned'])
h.check('assign: "finance" task (no one has the role) was left unassigned', by_title['Pay invoices']['assigneeId'] in (None, ''))
h.check('assign: untagged task was shared among everyone', by_title['Write docs']['assigneeId'] in (people['Ben Reyes'], people['Maya Cruz']))
h.check('assign: the role tag is stored on the task', 'frontend' in by_title['Fix navbar']['tags'] and 'finance' in by_title['Pay invoices']['tags'])

# Ben's open project view fills in by itself and shows only his tasks
use(B)
ok, secs = until(lambda: 'Fix navbar' in h.body(), 8)
h.check(f'live: Ben\'s open project shows his new task without a reload ({secs:.1f}s)', ok and B.evaluate("window.__noReload2 === true"))
bb = h.body()
h.check('member view: Ben does NOT see the backend or unassigned tasks', 'Build API' not in bb and 'Pay invoices' not in bb, bb[:300])

# ---------------------------------------------------------------- chat arrives by itself
use(B); B.get_by_label('Open Crew').count() and None
B.go_back() if False else None
h.nav('Team'); B.get_by_label('Open Crew').click(); h.wait(500); tab(B, 'Chat')
use(A); tab(A, 'Chat')
A.fill('textarea[aria-label="Message the team"]', 'Live hello from Maya'); A.click('button[aria-label="Send message"]')
ok, secs = until(lambda: 'Live hello from Maya' in B.locator('body').inner_text(), 8)
h.check(f'live: Ben receives the chat message without refreshing ({secs:.1f}s)', ok and secs < FAST, round(secs, 1))

# Ben scrolls up to read history: a new message must NOT yank him to the bottom
use(A)
for i in range(14):
    A.fill('textarea[aria-label="Message the team"]', f'Filler message number {i}'); A.click('button[aria-label="Send message"]'); h.wait(120)
use(B); until(lambda: 'Filler message number 13' in B.locator('body').inner_text(), 8)
log = B.locator('[role=log]').first
log.evaluate("e => { e.scrollTop = 0; e.dispatchEvent(new Event('scroll')); }"); h.wait(300)
use(A); A.fill('textarea[aria-label="Message the team"]', 'Message while Ben reads old ones'); A.click('button[aria-label="Send message"]')
use(B); until(lambda: 'Message while Ben reads old ones' in B.locator('body').inner_text(), 8); h.wait(400)
h.check('chat: a new message does not scroll Ben away from the old ones he is reading', log.evaluate("e => e.scrollTop") < 50, log.evaluate("e => e.scrollTop"))

# ---------------------------------------------------------------- the stream itself
if not NO_LIVE: h.check('transport: every signed-in tab holds a live stream open', all(n in live_requests for n in 'ABC'), live_requests)
h.check('transport: nothing was ever reloaded in B (same page throughout)', B.evaluate("window.__noReload === true"))

for p in (B, C): 
    try: p.close()
    except Exception: pass
use(A); h.done()
