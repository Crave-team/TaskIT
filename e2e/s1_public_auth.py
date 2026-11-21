import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
from urllib.parse import urlparse
h=H('1-public-auth'); pg=h.pg
# ---------- public pages
pg.goto(BASE+'/'); h.wait(600)
t=h.body()
h.check('homepage renders hero + feature sections', 'Plan it. Track it.' in t and 'Features' in t)
h.check('homepage header has Log in / Sign up', pg.locator('header button:has-text("Log in")').count()>0 and pg.locator('header button:has-text("Sign up")').count()>0)
h.check('footer has Admin entry + legal links', pg.locator('footer button:has-text("Admin")').count()>0 and pg.locator('footer a[href="/privacy"]').count()>0)
for path,word in [('/privacy','rivacy'),('/terms','erms')]:
    pg.goto(BASE+path); h.wait(400); h.check(f'{path} legal page renders', word in h.body())
pg.goto(BASE+'/login'); h.wait(500); h.check('/login opens the login popup', pg.locator('#login-email').count()==1)
pg.goto(BASE+'/signup'); h.wait(500); h.check('/signup opens the signup popup', pg.locator('#signup-name').count()==1)
pg.goto(BASE+'/this-page-does-not-exist'); h.wait(500)
h.check('unknown route does not crash', len(h.body())>20)
pg.goto(BASE+'/dashboard'); h.wait(600)
h.check('logged-out /dashboard: shows login popup, no app data', pg.locator('#login-email').count()==1 and pg.locator('a[aria-label="Calendar"]').count()==0)
h.check('logged-out /dashboard: URL is normalised to /', h.path()=='/', h.href())
for path in ['/tasks','/calendar','/team','/settings','/users','/system','/activity']:
    pg.goto(BASE+path); h.wait(300)
    h.check(f'logged-out {path} shows no app content', pg.locator('#login-email').count()==1 and pg.locator('a[aria-label="Calendar"]').count()==0)

# ---------- signup validation
pg.goto(BASE+'/?auth=signup'); pg.wait_for_selector('#signup-name')
def try_signup(n,e,p,c):
    pg.fill('#signup-name',n); pg.fill('#signup-email',e); pg.fill('#signup-password',p); pg.fill('#signup-confirm',c)
    pg.click('button:has-text("Create account")'); h.wait(400)
    return pg.locator('[role=alert]').inner_text() if pg.locator('[role=alert]').count() else ''
h.check('signup: empty name rejected', 'name' in try_signup('','a@b.com','password123','password123').lower())
h.check('signup: invalid email rejected', 'email' in try_signup('A','nope','password123','password123').lower())
h.check('signup: short password rejected', '8' in try_signup('A','a@b.com','short','short'))
h.check('signup: mismatched passwords rejected', 'match' in try_signup('A','a@b.com','password123','password124').lower())
pg.fill('#signup-confirm','password123'); pg.click('button:has-text("Create account")'); pg.wait_for_selector('#login-email')
h.check('signup success -> BLANK login popup with notice', pg.input_value('#login-email')=='' and pg.input_value('#login-password')=='' and 'created' in pg.locator('[role=dialog] [role=status]').inner_text().lower())

# ---------- login errors (account a@b.com exists now)
pg.click('[role=dialog] button[type=submit]'); h.wait(300)
h.check('login: blank submit rejected', 'both' in pg.locator('[role=alert]').inner_text().lower())
pg.fill('#login-email','ghost@x.com'); pg.fill('#login-password','password123'); pg.click('[role=dialog] button[type=submit]'); h.wait(400)
h.check('login: unknown email -> clear error', 'no account' in pg.locator('[role=alert]').inner_text().lower())
pg.fill('#login-email','A@B.com'); pg.fill('#login-password','wrongwrong'); pg.click('[role=dialog] button[type=submit]'); h.wait(400)
h.check('login: wrong password -> error (email matched case-insensitively)', 'incorrect' in pg.locator('[role=alert]').inner_text().lower())
# forgot password
pg.locator('[role=dialog] button:has-text("Forgot")').first.click(); pg.wait_for_selector('#reset-email')
pg.fill('#reset-email','ghost@x.com'); pg.locator('[role=dialog] button[type=submit]').first.click(); h.wait(400)
# Password reset is an EMAILED code. The answer must be the same for an unknown address (so nobody can find out who is
# registered), and without a mail server it says reset is not set up. Either way it must never say "no account".
body=h.body().lower()
h.check('forgot: an unknown email never reveals whether an account exists', 'no account' not in body and ('not set up' in body or pg.locator('#reset-code').count()>0), body[-300:])
pg.fill('#reset-email','a@b.com'); pg.locator('[role=dialog] button[type=submit]').first.click(); h.wait(500)
h.check('forgot: known email shows sent confirmation', 'sent' in h.body().lower() or 'check' in h.body().lower())
pg.keyboard.press('Escape'); h.wait(300)
h.check('Escape closes the popup', pg.locator('[role=dialog]').count()==0)

# ---------- admin portal
pg.locator('footer button:has-text("Admin")').click(); pg.wait_for_selector('#login-email')
pg.fill('#login-email','a@b.com'); pg.fill('#login-password','password123'); pg.click('[role=dialog] button[type=submit]'); h.wait(500)
h.check('member cannot sign in through the admin portal', 'member' in pg.locator('[role=alert]').inner_text().lower())
h.check('admin portal shows no demo credentials', 'Admin@2026' not in h.body() and 'admin@taskit.com' not in h.body() and 'Demo' not in pg.locator('[role=dialog]').inner_text())
pg.click('button:has-text("Create an admin account")'); pg.wait_for_selector('#signup-invite')
pg.fill('#signup-name','X'); pg.fill('#signup-email','x@y.com'); pg.fill('#signup-password','password123'); pg.fill('#signup-confirm','password123'); pg.fill('#signup-invite','nope')
pg.click('button:has-text("Create admin account")'); h.wait(400)
h.check('admin signup: wrong invite code rejected', 'invite' in pg.locator('[role=alert]').inner_text().lower())
pg.fill('#signup-invite',''); pg.click('button:has-text("Create admin account")'); h.wait(300)
h.check('admin signup: missing invite code rejected', 'invite' in pg.locator('[role=alert]').inner_text().lower())
pg.keyboard.press('Escape'); h.wait(300)

# ---------- successful member login, deep-link redirect, logout
h.open_login(); h.login('a@b.com')
h.check('member login lands on dashboard', h.path()=='/dashboard')
h.check('member sees member navigation (no admin items)', pg.locator('a[aria-label="Users"]').count()==0 and pg.locator('a[aria-label="System Settings"]').count()==0)
h.app_goto('/users'); h.check('member opening /users is sent back to the dashboard', h.path()=='/dashboard')
h.logout(); h.check('logout returns to the homepage', h.path()=='/')
h.app_goto('/tasks'); h.wait(400)
h.check('after logging out, going Back/forward to a private page lands on the homepage', h.path()=='/' and pg.locator('a[aria-label="Calendar"]').count()==0)
h.open_login(); h.login('a@b.com')
h.check('logging in again works after a logout', h.path()=='/dashboard')
h.done()
