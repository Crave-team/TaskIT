"""
The member's Settings -> "Due-date reminders" switch: moves at once, locks while saving, is saved, and turning it OFF
silences the overdue pop-up as well as the due-tomorrow one. Same two-server setup as s15_dev_refresh.py.
"""
import sys, os, time; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
h = H('member-alerts-toggle'); A = h.pg
h.signup('Maya Cruz', 'maya@x.com', first=True); h.login('maya@x.com')
h.wait(1500); h.skip_tour(); h.nav('My Workspace'); A.click('[data-tour=new-project]'); A.fill('#proj-name', 'Late'); A.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(1500)
A.get_by_label('Open tasks for Late').click(); h.wait(800)
A.locator('button:has-text("New task"):visible').first.click(); A.fill('#title', 'Old task'); A.fill('#dueDate', '2020-01-01')
A.locator('[role=dialog] button:has-text("Create task")').click(); h.wait(3000)
h.dismiss_popups(); h.wait(800)
A.goto(BASE + '/settings'); h.wait(3000); h.dismiss_popups()
sw = A.locator('button[role=switch][aria-label="Due-date reminders"]')
print('switch count', sw.count(), 'initial', sw.get_attribute('aria-checked'))
t = time.time(); sw.click(); h.wait(150)
h.check('MEMBER Due-date reminders: moves immediately (<1s)', sw.get_attribute('aria-checked') == 'false' and time.time()-t < 1.0, sw.get_attribute('aria-checked'))
h.check('MEMBER Due-date reminders: locked while saving', sw.is_disabled())
h.wait(3500)
h.check('MEMBER Due-date reminders: stays OFF after save', sw.get_attribute('aria-checked') == 'false')
A.reload(); h.wait(4500)
h.check('MEMBER Due-date reminders: still OFF after refresh', A.locator('button[role=switch][aria-label="Due-date reminders"]').get_attribute('aria-checked') == 'false')
# does a NEW overdue task still pop up after the member turned reminders OFF?
A.goto(BASE + '/tasks'); h.wait(2500); h.dismiss_popups()
A.get_by_label('Open tasks for Late').click(); h.wait(800)
A.locator('button:has-text("New task"):visible').first.click(); A.fill('#title', 'Second old'); A.fill('#dueDate', '2020-02-02')
A.locator('[role=dialog] button:has-text("Create task")').click(); h.wait(4000)
h.check('with Due-date reminders OFF, a new overdue task shows NO overdue pop-up', A.locator('[role=alertdialog]').count() == 0)
h.done()
