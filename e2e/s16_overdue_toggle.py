"""
The admin "Deadline & overdue alerts" switch: it moves at once even on a slow database, a second click cannot send the
wrong value, the choice is saved, and it silences the members' overdue pop-up. Same two-server setup as s15_dev_refresh.py.
"""
import sys; import os; import time; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *

h = H('overdue-toggle'); A = h.pg
h.signup('Maya Cruz', 'maya@x.com', first=True); h.login('maya@x.com')
h.nav('My Workspace'); A.click('[data-tour=new-project]'); A.fill('#proj-name', 'Late'); A.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(1500)
A.get_by_label('Open tasks for Late').click(); h.wait(800)
A.locator('button:has-text("New task"):visible').first.click(); A.fill('#title', 'Old task'); A.fill('#dueDate', '2020-01-01')
A.locator('[role=dialog] button:has-text("Create task")').click(); h.wait(3000)
h.check('an overdue task shows the overdue warning while alerts are ON', A.locator('[role=alertdialog]').count() == 1)
A.locator('button:has-text("Got it")').click(); h.wait(800)

B = h.ctx.new_page(); h.pg = B
h.admin_signup('Site Admin', 'boss@site.com')
B.goto(BASE + '/system'); h.wait(3500)
sw = B.locator('button[role=switch][aria-label="Deadline & overdue alerts"]')
h.check('the switch starts ON', sw.get_attribute('aria-checked') == 'true')
started = time.time(); sw.click(); h.wait(150)
h.check('the switch moves immediately (not after the server round trip)', sw.get_attribute('aria-checked') == 'false' and time.time() - started < 1.0)
h.check('the switch is locked while saving, so a second click cannot send the wrong value', sw.is_disabled())
h.wait(3500)
h.check('after saving it is OFF and unlocked', sw.get_attribute('aria-checked') == 'false' and not sw.is_disabled())
B.reload(); h.wait(4000)
h.check('the choice is saved (still OFF after a refresh)', B.locator('button[role=switch][aria-label="Deadline & overdue alerts"]').get_attribute('aria-checked') == 'false')

h.pg = A
A.goto(BASE + '/tasks'); h.wait(2500)
A.get_by_label('Open tasks for Late').click(); h.wait(800)
A.locator('button:has-text("New task"):visible').first.click(); A.fill('#title', 'Another old'); A.fill('#dueDate', '2020-02-02')
A.locator('[role=dialog] button:has-text("Create task")').click(); h.wait(4000)
h.check('with alerts OFF, a new overdue task shows no overdue warning', A.locator('[role=alertdialog]').count() == 0)
h.done()
