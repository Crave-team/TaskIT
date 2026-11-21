"""
Two accounts in ONE browser (same cookies, same storage origin), one per tab. Needs its own throw-away server:
    VITE_API_URL=/api npm run build
    STATIC_DIR=$PWD/dist PORT=4173 node server/test/e2e-tabs-server.mjs &
    python3 e2e/s10_two_tabs.py
Checks that a second sign-in in another tab never changes who the first tab is, that a brand-new tab does not inherit
anyone, and that uploaded files and avatars still load (they need the session header, see src/api/protectedUrl.js).
"""
import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import base64
from h import *

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
open('/tmp/tab-pic.png', 'wb').write(PNG)

h = H('two-tabs'); A = h.pg

def whoami(pg):
    """Who the server says this tab is, using the token this tab holds (None when signed out)."""
    return pg.evaluate("""async () => {
        const t = sessionStorage.getItem('taskit.session');
        const r = await fetch('/api/bootstrap', { headers: t ? { Authorization: 'Bearer ' + t } : {} });
        const me = (await r.json()).data.me; return me ? { email: me.email, role: me.accountRole } : null;
    }""")

def settings_email(pg):
    pg.goto(BASE + '/settings'); h.wait(1500); h.dismiss_popups()
    return pg.locator('main').inner_text() if pg.locator('main').count() else pg.locator('body').inner_text()

# ---- tab A: a member
h.signup('Maya Cruz', 'maya@x.com', first=True); h.login('maya@x.com')
h.check('tab A signed in as the member', (whoami(A) or {}).get('email') == 'maya@x.com')

# a project + task with an image attached, so file loading can be checked later
h.nav('My Workspace'); A.click('[data-tour=new-project]'); A.fill('#proj-name', 'Pics'); A.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(700)
A.get_by_label('Open tasks for Pics').click(); h.wait(500)
A.locator('button:has-text("New task"):visible').first.click(); A.fill('#title', 'Has a picture')
A.click('[role=dialog] [role=tab]:has-text("Files")'); A.set_input_files('[role=dialog] input[type=file]', '/tmp/tab-pic.png'); h.wait(900)
A.locator('[role=dialog] button:has-text("Create task")').click(); h.wait(1200); h.dismiss_popups()

# ---- tab B: a second tab of the SAME browser signs in as the site admin
B = h.ctx.new_page(); h.pg = B
h.admin_signup('Site Admin', 'boss@site.com')
h.pg = A
h.check('tab B signed in as the admin', (whoami(B) or {}).get('role') == 'admin')
h.check('tab A is STILL the member after tab B signed in', (whoami(A) or {}).get('email') == 'maya@x.com' and whoami(A).get('role') == 'user', whoami(A))
h.check('the two tabs hold different tokens', A.evaluate("sessionStorage.getItem('taskit.session')") != B.evaluate("sessionStorage.getItem('taskit.session')"))
h.check('no session cookie is set in the browser', not [c for c in h.ctx.cookies() if c['name'] == 'taskit_session' and c['value']], h.ctx.cookies())

# a full reload of each tab keeps its own identity (that is the sessionStorage part)
body_a = settings_email(A)
h.check('tab A, after a reload, still shows the member', 'maya@x.com' in body_a and 'boss@site.com' not in body_a)
body_b = settings_email(B)
h.check('tab B, after a reload, still shows the admin', 'boss@site.com' in body_b and 'maya@x.com' not in body_b)

# a brand-new tab has no session of its own: it must not inherit either account
C = h.ctx.new_page(); C.goto(BASE + '/dashboard'); h.wait(1500)
h.check('a new tab is signed out (the log-in popup is showing)', whoami(C) is None and C.locator('[role=dialog] input[type=email]').count() == 1, C.evaluate('location.href'))
C.close()

# files: the member's picture loads in tab A even though the admin signed in last
A.goto(BASE + '/tasks'); h.wait(1500); h.dismiss_popups()
A.get_by_label('Open tasks for Pics').click(); h.wait(600)
A.get_by_text('Has a picture').first.click(); h.wait(600)
A.click('[role=dialog] [role=tab]:has-text("Files")'); h.wait(900)
thumb = A.locator('[role=dialog] ul img').first
h.check('the attached picture loads in tab A (fetched with the session header)', thumb.count() == 1 and thumb.evaluate('i => i.complete && i.naturalWidth > 0') and thumb.get_attribute('src').startswith('blob:'))
file_url = A.evaluate("""async () => {
    const t = sessionStorage.getItem('taskit.session');
    const me = (await (await fetch('/api/bootstrap', { headers: { Authorization: 'Bearer ' + t } })).json()).data;
    const a = me.tasks.flatMap(x => x.attachments || []).find(x => x.url); return a ? a.url : null; }""")
status = lambda pg, tok: pg.evaluate("""async ([u, t]) => (await fetch(u, { headers: t ? { Authorization: 'Bearer ' + t } : {} })).status""", [file_url, tok])
h.check('the file URL is the protected API route', bool(file_url) and file_url.startswith('/api/files/'), file_url)
h.check('the member can read the file with their own token', status(A, A.evaluate("sessionStorage.getItem('taskit.session')")) == 200)
h.check('the file is refused with no token (a cookie is not enough)', status(A, None) == 401)

# logging one tab out leaves the other signed in
h.pg = B; h.logout(); h.pg = A
h.check('tab B logged out', whoami(B) is None)
h.check('tab A is unaffected by tab B logging out', (whoami(A) or {}).get('email') == 'maya@x.com')

h.done()
