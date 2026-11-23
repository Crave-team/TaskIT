"""
Password + emailed 6-digit code, in a real browser (sign up, log in, admin, Settings).

Needs the throw-away server (real Express app + built front end, in-memory data, codes required, "emails" written to a file):
    VITE_API_URL=/api npx vite build --outDir /tmp/dist-http --emptyOutDir
    cd server && STATIC_DIR=/tmp/dist-http PORT=4011 node test/e2e-code-server.mjs &
    python3 e2e/s7_email_code.py
"""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import h as harness
harness.BASE = 'http://127.0.0.1:4011'
from h import H

MAIL_LOG = os.environ.get('MAIL_LOG', '/tmp/taskit-mail.jsonl')
PW = 'password123'
h = H('email-code')
pg = h.pg

def mails():
    with open(MAIL_LOG) as f: return [json.loads(l) for l in f if l.strip()]
def last_code(): return re.search(r'\b(\d{6})\b', mails()[-1]['text']).group(1)
def wrong_code(): c = last_code(); return '000000' if c != '000000' else '111111'
where = lambda: pg.evaluate('location.pathname')
api = lambda path: pg.evaluate("async (p) => (await (await fetch('/api' + p)).json())", path)
post = lambda path, body=None: pg.evaluate("async ([p, b]) => { const r = await fetch('/api' + p, { method: 'POST', headers: { 'X-Requested-With': 'taskit', 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }); return [r.status, await r.json()]; }", [path, body])
def logout(): post('/auth/logout')
def type_code(code):
    pg.fill('#email-code', code); pg.get_by_role('button', name=re.compile('verify and continue', re.I)).click()

# ---------- member sign-up: details -> code -> account
pg.goto(harness.BASE + '/?auth=signup'); pg.wait_for_selector('#signup-name')
pg.fill('#signup-name', 'Maya Lee'); pg.fill('#signup-email', 'maya@gmail.com'); pg.fill('#signup-password', PW); pg.fill('#signup-confirm', PW)
pg.get_by_role('button', name=re.compile('^create account$', re.I)).click(); pg.wait_for_selector('#email-code')
h.check('sign-up asks for the emailed code', pg.locator('#email-code').count() == 1)
h.check('the code screen shows only a masked address', 'm***@gmail.com' in pg.inner_text('[role=dialog]') and 'maya@gmail.com' not in pg.inner_text('[role=dialog]'))
h.check('an email with a 6-digit code was sent to the right address', len(mails()) == 1 and mails()[0]['to'] == 'maya@gmail.com' and re.search(r'\b\d{6}\b', mails()[0]['text']))
h.check('nothing is created or signed in before the code is entered', api('/bootstrap')['data']['me'] is None)

pg.fill('#email-code', 'ab12cd'); 
h.check('the code box accepts digits only', pg.input_value('#email-code') == '12')
pg.fill('#email-code', ''); pg.fill('#email-code', '123456')
h.check('the resend button is on cooldown right after sending', pg.get_by_role('button', name=re.compile(r'send a new code in \d+s', re.I)).is_disabled())
type_code(wrong_code()); h.wait(500)
h.check('a wrong code is refused with the tries left', 'tries left' in pg.locator('[role=alert]').inner_text() and api('/bootstrap')['data']['me'] is None, pg.locator('[role=alert]').inner_text())

type_code(last_code()); pg.wait_for_url(re.compile(r'.*/dashboard.*')); h.wait(900)
me = api('/bootstrap')['data']['me']
h.check('the right code creates the account and signs in', me and me['email'] == 'maya@gmail.com' and me['name'] == 'Maya Lee' and me['accountRole'] == 'user', me)
h.skip_tour()

# ---------- a used code cannot be replayed
logout()

# ---------- member log-in: password -> code -> in
pg.goto(harness.BASE + '/'); h.open_login()
before = len(mails())
pg.fill('#login-email', 'maya@gmail.com'); pg.fill('#login-password', 'wrong-password-1'); pg.get_by_role('button', name=re.compile('^sign in$', re.I)).click(); h.wait(600)
h.check('a wrong password shows an error and sends NO email', 'incorrect' in pg.locator('[role=alert]').inner_text().lower() and len(mails()) == before)
pg.fill('#login-password', PW); pg.get_by_role('button', name=re.compile('^sign in$', re.I)).click(); pg.wait_for_selector('#email-code')
h.check('a correct password asks for a code instead of signing in', pg.locator('#email-code').count() == 1 and api('/bootstrap')['data']['me'] is None)
h.check('a login code was emailed', len(mails()) == before + 1)
pg.get_by_role('button', name=re.compile('^back$', re.I)).click(); pg.wait_for_selector('#login-email')
h.check('"Back" returns to the password form with the password cleared', pg.input_value('#login-password') == '')
pg.fill('#login-password', PW); pg.get_by_role('button', name=re.compile('^sign in$', re.I)).click(); pg.wait_for_selector('#email-code')
used = last_code()
type_code(used); pg.wait_for_url(re.compile(r'.*/dashboard.*')); h.wait(800)
h.check('the code signs in', api('/bootstrap')['data']['me']['email'] == 'maya@gmail.com')
logout()
status, body = post('/auth/code/verify', {'challengeToken': 'f' * 64, 'code': used})
h.check('a used code cannot be replayed', status == 401, (status, body))

# ---------- Settings shows the rule honestly
pg.goto(harness.BASE + '/'); h.open_login()
pg.fill('#login-email', 'maya@gmail.com'); pg.fill('#login-password', PW); pg.get_by_role('button', name=re.compile('^sign in$', re.I)).click(); pg.wait_for_selector('#email-code')
type_code(last_code()); pg.wait_for_url(re.compile(r'.*/dashboard.*')); h.wait(800); h.skip_tour()
pg.goto(harness.BASE + '/settings'); h.wait(1200); h.skip_tour()
sw = pg.get_by_role('switch', name=re.compile('two-factor', re.I))
h.check('Settings: two-step sign-in shows as on and locked (the server requires it)', sw.get_attribute('aria-checked') == 'true' and sw.is_disabled())
h.check('Settings explains it', 'Required on this server' in pg.inner_text('main'), pg.inner_text('main')[:200])
logout()

# ---------- admin sign-up and log-in also need the code
pg.goto(harness.BASE + '/'); h.wait(500)
pg.locator('footer button:has-text("Admin")').click(); pg.wait_for_selector('#login-email')
pg.click('button:has-text("Create an admin account")'); pg.wait_for_selector('#signup-invite')
pg.fill('#signup-name', 'Root Admin'); pg.fill('#signup-email', 'root@gmail.com'); pg.fill('#signup-password', PW); pg.fill('#signup-confirm', PW); pg.fill('#signup-invite', 'wrong-code')
n = len(mails())
pg.get_by_role('button', name=re.compile('create admin account', re.I)).click(); h.wait(700)
h.check('a wrong admin invite code is refused BEFORE any email is sent', 'invite code' in pg.locator('[role=alert]').inner_text().lower() and len(mails()) == n)
pg.fill('#signup-invite', 'ADMIN-2026')
pg.get_by_role('button', name=re.compile('create admin account', re.I)).click(); pg.wait_for_selector('#email-code')
type_code(last_code()); pg.wait_for_url(re.compile(r'.*/(dashboard|admin).*')); h.wait(900)
me = api('/bootstrap')['data']['me']
h.check('the admin is created and signed in after the code', me and me['accountRole'] == 'admin' and me['email'] == 'root@gmail.com', me)
logout()

pg.goto(harness.BASE + '/'); h.wait(500)
pg.locator('footer button:has-text("Admin")').click(); pg.wait_for_selector('#login-email')
pg.fill('#login-email', 'root@gmail.com'); pg.fill('#login-password', PW); pg.get_by_role('button', name=re.compile('sign in as admin', re.I)).click(); pg.wait_for_selector('#email-code')
h.check('admin log-in also asks for the code after the password', api('/bootstrap')['data']['me'] is None)
type_code(last_code()); pg.wait_for_url(re.compile(r'.*/(dashboard|admin).*')); h.wait(800)
h.check('admin signs in with the code', api('/bootstrap')['data']['me']['accountRole'] == 'admin')
logout()

# ---------- a member cannot use the admin tab, and no code is wasted on it
pg.goto(harness.BASE + '/'); h.wait(500)
pg.locator('footer button:has-text("Admin")').click(); pg.wait_for_selector('#login-email')
n = len(mails())
pg.fill('#login-email', 'maya@gmail.com'); pg.fill('#login-password', PW); pg.get_by_role('button', name=re.compile('sign in as admin', re.I)).click(); h.wait(700)
h.check('a member on the admin tab is refused and no code is sent', 'member' in pg.locator('[role=alert]').inner_text().lower() and len(mails()) == n)

h.done()
