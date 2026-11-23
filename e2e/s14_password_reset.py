"""
Forgot password, for real: emailed code + new password; the old password stops working; wrong codes are refused.
Needs the throw-away server (see s10_two_tabs.py); it records every "email" in /tmp/taskit-e2e-mail.jsonl.
"""
import sys; import os; import json; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *

MAIL = '/tmp/taskit-e2e-mail.jsonl'
open(MAIL, 'w').close()
def mails(): return [json.loads(l) for l in open(MAIL).read().splitlines() if l.strip()]
def last_code():
    import re
    return re.search(r'\b(\d{6})\b', mails()[-1]['text']).group(1)

h = H('reset'); pg = h.pg
def dialog(): return pg.locator('[role=dialog]')

h.signup('Maya Cruz', 'maya@x.com', first=True); h.login('maya@x.com'); h.logout()

# open the reset view from the log-in popup
pg.goto(BASE + '/?auth=login'); h.wait(1000)
dialog().locator('button:has-text("Forgot")').first.click(); h.wait(500)
h.check('the reset view opens inside the log-in popup', 'auth=forgot' in pg.evaluate('location.search') and pg.locator('#reset-email').count() == 1)

# an address with no account gets the very same next step, and nothing is emailed
pg.fill('#reset-email', 'ghost@x.com'); dialog().locator('button:has-text("Send code")').click(); h.wait(900)
h.check('unknown address: the same code step appears (no hint that it is unregistered)', pg.locator('#reset-code').count() == 1)
h.check('unknown address: no email was sent', len(mails()) == 0)
dialog().locator('button:has-text("Use a different email")').click(); h.wait(300)

# the real account
pg.fill('#reset-email', 'maya@x.com'); dialog().locator('button:has-text("Send code")').click(); h.wait(1000)
h.check('the code step is shown', pg.locator('#reset-code').count() == 1 and pg.locator('#reset-password').count() == 1)
h.check('an email with a 6-digit code was sent to the account address', len(mails()) == 1 and mails()[0]['to'] == 'maya@x.com' and 'reset' in mails()[0]['subject'].lower())

# validation happens before the code is spent
pg.fill('#reset-code', last_code()); pg.fill('#reset-password', 'short'); pg.fill('#reset-confirm', 'short')
dialog().locator('button:has-text("Change password")').click(); h.wait(500)
h.check('a too-short password is refused', 'at least 8' in dialog().inner_text())
pg.fill('#reset-password', 'brand-new-pass-1'); pg.fill('#reset-confirm', 'different-pass-9')
dialog().locator('button:has-text("Change password")').click(); h.wait(500)
h.check('mismatched passwords are refused', 'do not match' in dialog().inner_text())

# a wrong code is counted
good = last_code(); wrong = '000000' if good != '000000' else '000001'
pg.fill('#reset-code', wrong); pg.fill('#reset-confirm', 'brand-new-pass-1')
dialog().locator('button:has-text("Change password")').click(); h.wait(900)
h.check('a wrong code is refused with the tries left', 'not correct' in dialog().inner_text() and 'tries left' in dialog().inner_text())

# the right code finishes it
pg.fill('#reset-code', good); pg.fill('#reset-password', 'brand-new-pass-1'); pg.fill('#reset-confirm', 'brand-new-pass-1')
dialog().locator('button:has-text("Change password")').click(); h.wait(1200)
h.check('the password is changed', 'Password changed' in dialog().inner_text())
dialog().locator('button:has-text("Back to log in")').click(); h.wait(500)

# old password no longer works, new one does
pg.fill('#login-email', 'maya@x.com'); pg.fill('#login-password', 'password123')
dialog().locator('button[type=submit], button:has-text("Log in")').last.click(); h.wait(1200)
h.check('the OLD password no longer logs in', '/dashboard' not in pg.evaluate('location.pathname') and dialog().count() == 1)
pg.fill('#login-password', 'brand-new-pass-1')
dialog().locator('button[type=submit], button:has-text("Log in")').last.click(); h.wait(2000)
h.check('the NEW password logs in', '/dashboard' in pg.evaluate('location.pathname'), pg.evaluate('location.href'))

h.done()
