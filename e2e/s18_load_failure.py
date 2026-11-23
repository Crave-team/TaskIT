"""
A refresh while the server is briefly unreachable (or answering 503 / 429) must NOT look like being signed out: the app
shows "Try again", keeps the session, and the same page comes back once the server answers. Same setup as s15_dev_refresh.py.
"""
import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *

h = H('load-failure'); pg = h.pg
h.signup('Maya Cruz', 'maya@x.com', first=True); h.login('maya@x.com')
pg.goto(BASE + '/tasks'); h.wait(2000)

state = {'fail': True}
def gate(route):
    if state['fail']: route.fulfill(status=503, content_type='text/html', body='<h1>Service Unavailable</h1>')
    else: route.continue_()
pg.route('**/api/bootstrap**', gate)
pg.reload(); pg.wait_for_timeout(6500)  # longer than the three automatic attempts (Playwright's own wait, so the route handler keeps running)
now = pg.evaluate('location.pathname + location.search')
h.check('server down on refresh: stays on the page, no log-in popup', now == '/tasks' and pg.locator('#login-email').count() == 0, now)
h.check('it offers "Try again"', pg.locator('button:has-text("Try again")').count() == 1)
state['fail'] = False
pg.locator('button:has-text("Try again")').click(); pg.wait_for_timeout(3000)
h.check('after Try again the workspace is back, still signed in', pg.evaluate('location.pathname') == '/tasks' and pg.locator('button:has-text("Try again")').count() == 0 and pg.locator('[data-tour=new-project]').count() == 1)
h.done()
