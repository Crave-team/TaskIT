"""
System test (REAL stack: Express + MongoDB, built with VITE_API_URL=/api) for the Daily digest: the Settings switch, the
once-a-day summary in the notification bell, its counts, the on/off behaviour and the admin's site-wide switch.
Mirrors scenario 14 of docs/MANUAL_TEST_SCENARIOS.md. Test data is created through the app's own API from the browser
tab (fast and exact); everything the person would see is checked in the UI.
"""
import os, sys, time, json; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
from datetime import date, timedelta
iso = lambda n: (date.today() + timedelta(days=n)).isoformat()

h = H('20-daily-digest'); A = h.pg
B = h.ctx.new_page(); C = h.ctx.new_page(); D = h.ctx.new_page()
def use(pg): h.pg = pg
def api(pg, method, path, body=None):
    return pg.evaluate("""async ([m, p, b]) => { const t = sessionStorage.getItem('taskit.session');
        const r = await fetch('/api' + p, { method: m, headers: { Authorization: 'Bearer ' + t, 'X-Requested-With': 'taskit', 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
        return { status: r.status, json: await r.json().catch(() => null) }; }""", [method, path, body])
def until(fn, secs=8.0):
    t0 = time.time()
    while time.time() - t0 < secs:
        try:
            if fn(): return True
        except Exception: pass
        time.sleep(0.15)
    return False
def open_settings(pg):
    pg.goto(BASE + '/settings'); h.wait(1500); clear(pg)
def clear(pg):
    """Closes the Overdue / Due today / Due tomorrow reminder pop-ups (their backdrop would block the next click)."""
    h.dismiss_popups()
    for _ in range(4):
        if pg.locator('[role=dialog]:has-text("Overdue"), [role=dialog]:has-text("Due today"), [role=dialog]:has-text("Due tomorrow")').count():
            pg.keyboard.press('Escape'); h.wait(300)
def digest_switch(pg): return pg.get_by_role('switch', name='Daily digest')
def bell_items(pg):
    clear(pg)
    pg.click('button[aria-label^="Notifications"]'); h.wait(300)
    items = [x.inner_text().replace('\n', ' ') for x in pg.locator('[role=menu] li').all()]
    return items
def close_bell(pg):
    if pg.locator('[role=menu]').count(): pg.keyboard.press('Escape'); h.wait(200)
def digests(pg): return [i for i in bell_items(pg) if i.lower().startswith('daily digest')]
def shut(pg):
    close_bell(pg)

# ---------------------------------------------------------------- Dana: a brand-new account, nothing due yet
use(A); h.signup('Dana Fox', 'dana@x.com', first=True); h.login('dana@x.com')
open_settings(A)
sw = digest_switch(A)
h.check('settings: Daily digest is a real switch, on by default (no "Coming soon")', sw.is_enabled() and sw.get_attribute('aria-checked') == 'true' and 'Coming soon' not in h.body())
sw.click(); h.wait(700)
h.check('settings: it can be turned off', digest_switch(A).get_attribute('aria-checked') == 'false')

# six tasks + a reminder, created while the digest is off
proj = api(A, 'POST', '/projects', {'name': 'Work'})['json']['data']
def task(title, days):
    return api(A, 'POST', '/tasks', {'input': {'title': title, 'dueDate': iso(days), 'projectId': proj['id'], 'priority': 'medium', 'status': 'todo'}})['json']['data']
task('Overdue one', -3); task('Due today', 0); task('Due tomorrow', 1); task('Due in five days', 5); task('Due in thirty days', 30)
fin = task('Already finished', 0); api(A, 'PUT', f"/tasks/{fin['id']}/status", {'status': 'done'})
api(A, 'POST', '/reminders', {'title': 'Call the bank', 'date': iso(0)})
A.reload(); h.wait(2500); clear(A)
items = bell_items(A)
h.check('bell: with the switch off there is no Daily digest (the usual deadline notices still arrive)', not any(i.lower().startswith('daily digest') for i in items) and any('overdue' in i.lower() for i in items), items)
close_bell(A)

# ---------------------------------------------------------------- switch it on: today's digest appears at once
open_settings(A); digest_switch(A).click(); h.wait(500)
h.check('settings: it can be turned back on', digest_switch(A).get_attribute('aria-checked') == 'true')
A.click('button[aria-label^="Notifications"]'); h.wait(300)
EXPECT = 'Daily digest: 1 overdue, 1 due today, 1 due tomorrow, 1 more due in the next 7 days, 1 reminder today.'
ok = until(lambda: any(x.inner_text().replace('\n', ' ').startswith(EXPECT) for x in A.locator('[role=menu] li').all()))
items = [x.inner_text().replace('\n', ' ') for x in A.locator('[role=menu] li').all()]
mine = [i for i in items if i.lower().startswith('daily digest')]
h.check('digest: switching it on creates today\'s digest straight away', ok, items)
h.check('digest: counts are right (30-day and finished tasks are left out)', len(mine) == 1 and mine[0].startswith(EXPECT), mine)
h.check('digest: it never pops up on its own', A.locator('[role=alertdialog]:has-text("Daily digest"), [role=dialog]:has-text("Daily digest")').count() == 0)
h.check('digest: it is unread (the bell shows an unread count)', 'unread' in (A.get_attribute('button[aria-label^="Notifications"]', 'aria-label') or '').lower())
A.locator('[role=menu] li').filter(has_text='Daily digest').first.locator('button').first.click(); h.wait(800)
h.check('digest: clicking it opens the Tasks page', h.path() == '/tasks', h.path())

# off and on again: still one for today
open_settings(A); digest_switch(A).click(); h.wait(600); digest_switch(A).click(); h.wait(900)
h.check('digest: off then on again does not make a second digest for the same day', len(digests(A)) == 1, digests(A))
close_bell(A)

# ---------------------------------------------------------------- someone else: only their own tasks count; nothing due = no digest
use(B); h.signup('Eli Park', 'eli@x.com', first=True); h.login('eli@x.com'); h.wait(1000); h.dismiss_popups()
h.check('other person: no tasks means no digest, and Dana\'s tasks are never counted', digests(B) == [], bell_items(B))
close_bell(B)

# ---------------------------------------------------------------- the admin's site-wide "Deadline & overdue alerts" switch
use(C); h.admin_signup(); h.wait(800)
h.check('admin: turns the site-wide deadline alerts off', api(C, 'PATCH', '/admin/settings', {'notifyDeadlines': False})['status'] == 200)
use(D); h.signup('Fay Lee', 'fay@x.com', first=True); h.login('fay@x.com')
fp = api(D, 'POST', '/projects', {'name': 'Fay'})['json']['data']
api(D, 'POST', '/tasks', {'input': {'title': 'Fay late', 'dueDate': iso(-2), 'projectId': fp['id'], 'priority': 'medium', 'status': 'todo'}})
D.reload(); h.wait(2500); clear(D)
h.check('site switch off: no digest is made, even for someone with an overdue task', digests(D) == [], bell_items(D))
close_bell(D)
use(C); api(C, 'PATCH', '/admin/settings', {'notifyDeadlines': True})
D.reload(); h.wait(2500); clear(D)
d2 = digests(D)
h.check('site switch back on: the digest arrives', len(d2) == 1 and d2[0].startswith('Daily digest: 1 overdue.'), d2)

# ---------------------------------------------------------------- Due-date reminders is a separate switch
use(A); open_settings(A)
sw2 = A.get_by_role('switch', name='Due-date reminders'); sw2.click(); h.wait(700)
A.reload(); h.wait(1800)
h.check('"Due-date reminders" is separate: it can be off while Daily digest stays on', A.get_by_role('switch', name='Due-date reminders').get_attribute('aria-checked') == 'false' and digest_switch(A).get_attribute('aria-checked') == 'true')

for p in (B, C, D):
    try: p.close()
    except Exception: pass
use(A); h.done()
