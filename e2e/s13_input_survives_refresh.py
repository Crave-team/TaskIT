"""
Typed input and open windows survive a refresh (passwords never do), and nothing carries over to the next login.
Needs the throw-away server (see s10_two_tabs.py for how to start it).
"""
import sys; import os; import re; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *

h = H('input-refresh'); pg = h.pg

def reload():
    pg.reload(); h.wait(2500)   # no clicks here: the first click would end the restore window on purpose

def dialog(): return pg.locator('[role=dialog]')
def storage_dump(): return pg.evaluate("JSON.stringify(Object.entries(sessionStorage))")

h.signup('Maya Cruz', 'maya@x.com', first=True); h.login('maya@x.com')

# ---------------- workspace: a half-filled new-task window, with a typed-but-not-added subtask
h.nav('My Workspace'); pg.click('[data-tour=new-project]'); pg.fill('#proj-name', 'Pics')
pg.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(700)
pg.get_by_label('Open tasks for Pics').click(); h.wait(500)
project_url = pg.evaluate('location.pathname + location.search')
pg.locator('button:has-text("New task"):visible').first.click()
pg.fill('#title', 'Draft title'); pg.fill('#description', 'half written notes')
pg.click('[role=dialog] [role=tab]:has-text("Subtasks")'); pg.fill('[role=dialog] input[placeholder="Add a subtask…"]', 'typed not added')
reload()
h.check('workspace: the new-task window is still open', dialog().count() == 1 and pg.evaluate('location.pathname + location.search') == project_url)
h.check('workspace: it is still on the Subtasks tab with the typed text', dialog().locator('input[placeholder="Add a subtask…"]').count() == 1 and dialog().locator('input[placeholder="Add a subtask…"]').input_value() == 'typed not added')
pg.click('[role=dialog] [role=tab]:has-text("Details")'); h.wait(300)
h.check('workspace: title and description are still there', pg.input_value('#title') == 'Draft title' and pg.input_value('#description') == 'half written notes')

# closing the window means the next refresh shows none
pg.keyboard.press('Escape'); h.wait(400)
if dialog().count(): pg.locator('[role=dialog] button:has-text("Discard"), [role=dialog] button:has-text("Cancel")').first.click(); h.wait(400)
h.check('workspace: the window closed', dialog().count() == 0)
reload()
h.check('workspace: after closing and refreshing there is no window', dialog().count() == 0)

# ---------------- team hub: create window with typed name
pg.goto(BASE + '/team'); h.wait(1500)
pg.locator('button:has-text("Create team")').first.click(); pg.fill('#grp-name', 'Alpha Team'); pg.fill('#grp-desc', 'for the alphas')
reload()
h.check('team hub: the create-team window is still open with what was typed', dialog().count() == 1 and pg.input_value('#grp-name') == 'Alpha Team' and pg.input_value('#grp-desc') == 'for the alphas')
pg.locator('[role=dialog] button:has-text("Create team")').last.click(); h.wait(1500)

# ---------------- inside the team: chat draft and announcement draft
pg.fill('textarea[placeholder="Aa"]', 'hello team, typing...')
reload()
h.check('team chat: the unsent message is still in the box', pg.locator('textarea[placeholder="Aa"]').input_value() == 'hello team, typing...')
pg.locator('[data-tour=team-tabs] [role=tab]:has-text("Announcements")').click(); h.wait(500)
pg.fill('textarea[placeholder^="Share an announcement"]', 'big news draft')
reload()
h.check('team announcements: the draft is still there', pg.locator('textarea[placeholder^="Share an announcement"]').input_value() == 'big news draft')

# ---------------- calendar: view, day window and the reminder being typed
pg.goto(BASE + '/calendar'); h.wait(1500)
pg.get_by_role('button', name=re.compile('Agenda')).click(); h.wait(300)
reload()
h.check('calendar: the Agenda view is still selected', pg.get_by_role('button', name=re.compile('Agenda')).first.get_attribute('aria-pressed') == 'true')
pg.get_by_role('button', name=re.compile('Month')).first.click(); h.wait(300)
pg.locator('main button').filter(has_text=re.compile(r'^\d{1,2}$')).first.click(); h.wait(500)
check_day = dialog().count() == 1
reload()
h.check('calendar: the day window is still open after a refresh', check_day and dialog().count() == 1)
pg.locator('[role=dialog] button:has-text("Add")').first.click(); h.wait(500)
pg.locator('[role=dialog] [role=tab]:has-text("Reminder"), [role=dialog] button:has-text("Reminder")').first.click(); h.wait(300)
pg.fill('[role=dialog] input[placeholder^="e.g. Call the vendor"]', 'renew licence')
reload()
h.check('calendar: the add-reminder window kept its text', dialog().count() == 1 and dialog().locator('input[placeholder^="e.g. Call the vendor"]').input_value() == 'renew licence')

# ---------------- settings: edit-profile window with a changed name
pg.goto(BASE + '/settings'); h.wait(1500)
pg.locator('button:has-text("Edit profile")').first.click(); h.wait(400)
pg.fill('#profile-name', 'Maya Renamed')
reload()
h.check('settings: the edit-profile window is still open with the new name', dialog().count() == 1 and pg.input_value('#profile-name') == 'Maya Renamed')

# ---------------- logged out: log-in and sign-up popups keep the typed email/name, never the password
h.pg = pg
pg.keyboard.press('Escape'); h.wait(300)
h.logout()
pg.goto(BASE + '/?auth=login'); h.wait(1200)
pg.fill('#login-email', 'draft@x.com'); pg.fill('#login-password', 'SuperSecret-123')
reload()
h.check('log in: the email is still there', pg.input_value('#login-email') == 'draft@x.com')
h.check('log in: the password is NOT restored', pg.input_value('#login-password') == '')
h.check('log in: the password was never written to storage', 'SuperSecret-123' not in storage_dump())
pg.goto(BASE + '/?auth=signup'); h.wait(1200)
pg.fill('#signup-name', 'New Person'); pg.fill('#signup-email', 'new@x.com'); pg.fill('#signup-password', 'AnotherSecret-9'); pg.fill('#signup-confirm', 'AnotherSecret-9')
reload()
h.check('sign up: name and email are still there', pg.input_value('#signup-name') == 'New Person' and pg.input_value('#signup-email') == 'new@x.com')
h.check('sign up: password and confirmation are NOT restored', pg.input_value('#signup-password') == '' and pg.input_value('#signup-confirm') == '')
h.check('sign up: the passwords were never written to storage', 'AnotherSecret-9' not in storage_dump())

# ---------------- nothing carries over to the next login
pg.goto(BASE + '/?auth=login'); h.wait(1000)
pg.fill('#login-email', 'maya@x.com'); pg.fill('#login-password', 'password123')
pg.locator('[role=dialog] button[type=submit], [role=dialog] button:has-text("Log in")').last.click(); h.wait(2500)
left = storage_dump()
h.check('after logging in again, nothing typed in the earlier visit is left in storage',
        not any(text in left for text in ['hello team', 'big news draft', 'renew licence', 'Maya Renamed', 'half written notes', 'draft@x.com']), left)
pg.goto(BASE + '/team'); h.wait(1500)
pg.get_by_text('Alpha Team').first.click(); h.wait(1200)
h.check('after logging in again, the old chat draft is gone', pg.locator('textarea[placeholder="Aa"]').count() == 1 and pg.locator('textarea[placeholder="Aa"]').input_value() == '')

h.done()
