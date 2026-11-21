"""
Google sign-in / sign-up in a real browser, for members and admins.

Needs the throw-away server (real Express app + built front end, fake Google verifier, no internet):
    VITE_API_URL=/api npx vite build --outDir /tmp/dist-http --emptyOutDir
    cd server && STATIC_DIR=/tmp/dist-http PORT=4010 node test/e2e-google-server.mjs &
    python3 e2e/s6_google_auth.py
Google's real script is replaced (via request interception) by a stub that renders a button; clicking it hands the
page's callback a token for the identity in `window.__identity`. The CSP still applies to that script load.
"""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import h as harness
harness.BASE = 'http://127.0.0.1:4010'
from h import H

CLIENT_ID = 'e2e-client.apps.googleusercontent.com'
STUB = """
window.google = { accounts: { id: {
  initialize(o) { window.__gsi = o; },
  renderButton(el, o) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.gsi = o.text; b.textContent = 'Google (' + o.text + ')';
    b.onclick = () => {
      const json = JSON.stringify(Object.assign({ sub: 'g-1', email: 'maya@gmail.com', verified: true, name: 'Maya Lee' }, window.__identity || {}));
      const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      window.__gsi.callback({ credential: 'valid-' + b64 });
    };
    el.appendChild(b);
  },
} } };
"""

h = H('google')
pg = h.pg
pg.route('https://accounts.google.com/gsi/client', lambda r: r.fulfill(status=200, content_type='text/javascript', body=STUB))
api = lambda path: pg.evaluate("async (p) => (await (await fetch('/api' + p)).json())", path)
post = lambda path: pg.evaluate("async (p) => (await fetch('/api' + p, { method: 'POST', headers: { 'X-Requested-With': 'taskit' } })).status", path)
where = lambda: pg.evaluate('location.pathname')  # the harness's pg.url can lag behind client-side redirects
def set_identity(**kw): pg.evaluate("(i) => { window.__identity = i }", kw)

# ---------- every app page needs a sign-in
APP_PAGES = ['/dashboard', '/tasks', '/projects', '/calendar', '/team', '/settings', '/users', '/system', '/activity']
bounced = []
for path in APP_PAGES:
    pg.goto(harness.BASE + path); h.wait(800)
    if where() != '/' or pg.locator('#login-email').count() != 1: bounced.append((path, where()))
h.check('signed out: every app page sends you to the log-in popup', not bounced, bounced)

# ---------- member: log in popup
pg.goto(harness.BASE + '/')
h.open_login()
pg.wait_for_selector('button[data-gsi]')
h.check('member log-in popup shows the Google button', pg.locator('[role=dialog] button[data-gsi="continue_with"]').count() == 1)
h.check('Google is initialised with the server-provided client id', pg.evaluate('window.__gsi && window.__gsi.client_id') == CLIENT_ID)
h.check('password form is still there next to it', pg.locator('#login-email').count() == 1 and pg.locator('#login-password').count() == 1)

# ---------- member: first Google sign-in creates the account and signs in
pg.click('button[data-gsi="continue_with"]')
pg.wait_for_url('**/dashboard'); h.wait(1200)
me = api('/bootstrap')['data']['me']
h.check('Google member sign-in lands on the dashboard, signed in as a member', me['email'] == 'maya@gmail.com' and me['accountRole'] == 'user' and me['name'] == 'Maya Lee', me)
h.check('account has no password and no secrets reach the browser', me['hasPassword'] is False and me['googleLinked'] is True and 'passwordHash' not in me and 'googleId' not in me)
h.skip_tour()
denied = []
for path in ['/users', '/system', '/activity']:
    pg.goto(harness.BASE + path); h.wait(800)
    if where() != '/dashboard': denied.append((path, where()))
h.check('a Google member is kept out of every admin page', not denied, denied)
member_pages = []
for path in ['/dashboard', '/tasks', '/calendar', '/settings']:
    pg.goto(harness.BASE + path); h.wait(600)
    if where() != path: member_pages.append((path, where()))
h.check('a Google member can open the member pages', not member_pages, member_pages)

# ---------- Google-only account sets a password instead of "changing" one
pg.goto(harness.BASE + '/settings'); h.wait(1200); h.skip_tour()
opener = pg.get_by_role('button', name=re.compile('password', re.I))
if opener.count():
    opener.first.click(); h.wait(400)
    dlg = pg.locator('[role=dialog]')
    h.check('Google-only account is offered "Set a password" with no current-password field',
            'Set a password' in dlg.inner_text() and pg.locator('#current-password').count() == 0, dlg.inner_text()[:120])
    pg.fill('#new-password', 'a-new-password-1'); pg.fill('#confirm-password', 'a-new-password-1')
    dlg.get_by_role('button', name=re.compile('set password', re.I)).click(); h.wait(600)
    h.check('setting the password works and the account now has one', api('/bootstrap')['data']['me']['hasPassword'] is True)
else:
    h.check('settings page has a password button', False)

# ---------- sign out, then admin portal
post('/auth/logout')
pg.goto(harness.BASE + '/'); h.wait(500)
pg.locator('footer button:has-text("Admin")').click(); pg.wait_for_selector('#login-email')
pg.wait_for_selector('button[data-gsi]')
h.check('admin log-in popup shows the Google button', pg.locator('[role=dialog] button[data-gsi="signin_with"]').count() == 1)
set_identity(sub='g-root', email='root@gmail.com', name='Root Admin')
pg.click('button[data-gsi="signin_with"]'); h.wait(700)
h.check('admin portal: Google account with no admin account is told so, and nothing is created',
        'no admin account' in pg.locator('[role=alert]').inner_text().lower() and api('/bootstrap')['data']['me'] is None, pg.locator('[role=alert]').inner_text())

# ---------- the member's Google account cannot sneak into the admin portal
set_identity(sub='g-1', email='maya@gmail.com', name='Maya Lee')
pg.click('button[data-gsi="signin_with"]'); h.wait(700)
h.check('a member Google account is refused by the admin portal (never promoted)',
        'member' in pg.locator('[role=alert]').inner_text().lower() and api('/bootstrap')['data']['me'] is None, pg.locator('[role=alert]').inner_text())

# ---------- admin sign-up with Google needs the invite code
pg.click('button:has-text("Create an admin account")'); pg.wait_for_selector('#signup-invite'); pg.wait_for_selector('button[data-gsi="signup_with"]')
set_identity(sub='g-root', email='root@gmail.com', name='Root Admin')
blocked = pg.eval_on_selector('button[data-gsi="signup_with"]', "el => getComputedStyle(el.parentElement).pointerEvents")
h.check('admin sign-up: the Google button is disabled until an invite code is typed', blocked == 'none', blocked)
pg.evaluate("document.querySelector('button[data-gsi=\"signup_with\"]').click()"); h.wait(500)
h.check('even if forced, a missing invite code is refused', 'invite code' in pg.locator('[role=alert]').inner_text().lower() and api('/bootstrap')['data']['me'] is None)
pg.fill('#signup-invite', 'wrong-code')
pg.click('button[data-gsi="signup_with"]'); h.wait(600)
h.check('a wrong invite code is refused', 'invalid admin invite code' in pg.locator('[role=alert]').inner_text().lower() and api('/bootstrap')['data']['me'] is None, pg.locator('[role=alert]').inner_text())
pg.fill('#signup-invite', 'ADMIN-2026')
pg.click('button[data-gsi="signup_with"]'); pg.wait_for_url(re.compile(r'.*/(dashboard|admin).*')); h.wait(1000)
me = api('/bootstrap')['data']['me']
h.check('the right invite code creates the admin and signs them in as admin', me and me['accountRole'] == 'admin' and me['email'] == 'root@gmail.com', me)
h.check('admin pages work for the Google admin', pg.locator('a[aria-label="Users"]').count() > 0 or pg.locator('a[aria-label="System Settings"]').count() > 0)
opened = []
for path in ['/users', '/system', '/activity']:
    pg.goto(harness.BASE + path); h.wait(800)
    if where() == path: opened.append(path)
h.check('a Google admin can open every admin page', opened == ['/users', '/system', '/activity'], opened)

# ---------- returning admin signs in with Google, no code
post('/auth/logout')
pg.goto(harness.BASE + '/'); h.wait(400)
pg.locator('footer button:has-text("Admin")').click(); pg.wait_for_selector('button[data-gsi="signin_with"]')
set_identity(sub='g-root', email='root@gmail.com', name='Root Admin')  # a reload clears window.__identity
pg.click('button[data-gsi="signin_with"]'); pg.wait_for_url(re.compile(r'.*/(dashboard|admin).*')); h.wait(800)
h.check('returning admin signs in with Google and no invite code', api('/bootstrap')['data']['me']['accountRole'] == 'admin')

# ---------- member sign-up view
post('/auth/logout')
pg.goto(harness.BASE + '/?auth=signup'); pg.wait_for_selector('#signup-name'); pg.wait_for_selector('button[data-gsi="signup_with"]')
h.check('member sign-up popup shows "Sign up with Google"', pg.locator('[role=dialog] button[data-gsi="signup_with"]').count() == 1)

h.done()
