"""
The log-in / sign-up popups (member and admin) survive a refresh; closing one removes it for good.
Needs the throw-away server (see s10_two_tabs.py for how to start it).
"""
import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *

h = H('auth-popup'); pg = h.pg

def where(): return pg.evaluate('location.pathname + location.search')
def title():
    d = pg.locator('[role=dialog]')
    return d.first.locator('h2, [id*=title]').first.inner_text() if d.count() else None
def reload(): pg.reload(); h.wait(1500)
def popup_has(text): return pg.locator('[role=dialog]').count() == 1 and text in pg.locator('[role=dialog]').inner_text()

# an account to use later
h.signup('Maya Cruz', 'maya@x.com', first=True); h.login('maya@x.com'); h.logout()

# member log in
pg.goto(BASE + '/'); h.wait(1200)
pg.locator('header button:has-text("Log in"), header a:has-text("Log in")').first.click(); h.wait(500)
h.check('Log in opens the popup and puts it in the address', where() == '/?auth=login' and popup_has('Log in'), where())
reload()
h.check('refresh: the log-in popup is still open', where() == '/?auth=login' and popup_has('Log in'), where())

# switch to sign up inside the popup
pg.locator('[role=dialog] >> text=Sign up').first.click(); h.wait(500)
h.check('switching to sign up updates the address', 'auth=signup' in where(), where())
reload()
h.check('refresh: the sign-up popup is still open', popup_has('Create your account'), where())

# admin views
pg.goto(BASE + '/?auth=admin'); h.wait(1200)
h.check('admin log-in popup opens from its address', popup_has('Admin log in'))
reload()
h.check('refresh: the admin log-in popup is still open', popup_has('Admin log in') and 'auth=admin' in where(), where())
pg.locator('[role=dialog] button:has-text("Create an admin account")').click(); h.wait(500)
h.check('admin sign-up is in the address', 'auth=admin-signup' in where(), where())
reload()
h.check('refresh: the admin sign-up popup is still open', popup_has('Create an admin account'), where())

# closing it takes it away for good
pg.keyboard.press('Escape'); h.wait(500)
h.check('closing removes the popup from the address', 'auth=' not in where() and pg.locator('[role=dialog]').count() == 0, where())
reload()
h.check('refresh after closing: no popup', pg.locator('[role=dialog]').count() == 0, where())

# a deep link while signed out: popup + where to go afterwards both survive a refresh, then login lands there
pg.goto(BASE + '/team'); h.wait(1500)
h.check('signed-out deep link opens the log-in popup', popup_has('Log in') and 'next=%2Fteam' in where(), where())
reload()
h.check('refresh keeps the popup AND the destination', popup_has('Log in') and 'next=%2Fteam' in where(), where())
pg.fill('#login-email', 'maya@x.com'); pg.fill('#login-password', 'password123')
pg.locator('[role=dialog] button[type=submit], [role=dialog] button:has-text("Log in")').last.click(); h.wait(2000)
h.check('after logging in you land on the page you were heading to', where().startswith('/team'), where())

h.done()
