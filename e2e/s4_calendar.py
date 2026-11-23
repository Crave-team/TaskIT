import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
from datetime import date, timedelta
today=date.today()
lab=lambda dt: f"Open {dt.strftime('%A, %B')} {dt.day}"
h=H('4-calendar'); pg=h.pg
h.signup('Maya Cruz','maya@x.com',first=True); h.login('maya@x.com')
h.nav('My Workspace'); pg.click('[data-tour=new-project]'); h.wait(300)
pg.fill('#proj-name','Alpha'); pg.fill('#proj-due',(today+timedelta(days=9)).isoformat())
pg.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(500)
pg.get_by_label('Edit Alpha').click(); h.wait(300)
pg.fill('input[aria-label="Milestone name"]','Beta launch'); pg.fill('input[aria-label="Milestone date"]',(today+timedelta(days=4)).isoformat())
pg.locator('[role=dialog] button:has-text("Add")').first.click(); h.wait(400)
pg.keyboard.press('Escape'); h.wait(300)

h.nav('Calendar'); h.wait(400)
h.check('calendar: month grid with today highlighted', pg.get_by_label(lab(today)).count()==1 and 'Calendar' in h.body())
t=h.body()
h.check('calendar: weekday headers', all(x in t.upper() for x in ['SUN','MON','TUE','WED','THU','FRI','SAT']))
h.check('calendar: project milestone appears on its date', 'Beta launch' in pg.get_by_label(lab(today+timedelta(days=4))).inner_text() or 'Beta launch' in h.body())

# --- navigate months
month_before=pg.locator('text=/^(January|February|March|April|May|June|July|August|September|October|November|December) \\d{4}$/').first.inner_text()
pg.get_by_label('Next month').click(); h.wait(300)
m2=pg.locator('text=/^(January|February|March|April|May|June|July|August|September|October|November|December) \\d{4}$/').first.inner_text()
pg.get_by_label('Previous month').click(); pg.get_by_label('Previous month').click(); h.wait(300)
m3=pg.locator('text=/^(January|February|March|April|May|June|July|August|September|October|November|December) \\d{4}$/').first.inner_text()
h.check('calendar: next/previous month change the title', len({month_before,m2,m3})==3, (month_before,m2,m3))
pg.locator('button:has-text("Today")').click(); h.wait(300)
h.check('calendar: Today returns to the current month', pg.locator(f'text={month_before}').count()>=1)

# --- add a task directly (no "Continue" step) with date prefilled
d1=today+timedelta(days=2)
pg.get_by_label(lab(d1)).click(); h.wait(300)
h.check('day sheet: empty day invites adding something', 'Add' in pg.locator('[role=dialog]').inner_text())
pg.click('button:has-text("Add task or reminder")'); h.wait(400)
h.check('add dialog: the task form is shown immediately (no Continue button)', pg.locator('#title').is_visible() and pg.locator('button:has-text("Continue")').count()==0)
h.check('add dialog: due date is pre-set to the clicked day', pg.locator('input[type=date]').first.input_value()==d1.isoformat())
h.check('add dialog: Task | Reminder switcher present', pg.locator('[role=dialog] [role=tab]:has-text("Reminder")').count()==1)
pg.fill('#title','Calendar task'); pg.click('button:has-text("Create task")'); h.wait(700)
h.check('add task: returns to the day sheet showing the new task', 'Calendar task' in pg.locator('[role=dialog]').inner_text())

# --- add reminders (3 days out, and one for tomorrow -> popup)
pg.click('button:has-text("Add task or reminder")'); h.wait(300)
pg.click('[role=dialog] [role=tab]:has-text("Reminder")'); h.wait(200)
pg.click('[role=dialog] button:has-text("Add reminder")'); h.wait(300)
h.check('reminder: empty title rejected', 'title' in pg.locator('[role=dialog]').inner_text().lower())
pg.fill('#rem-title','Dentist'); pg.fill('#rem-time','14:30'); pg.fill('#rem-note','Bring forms') if pg.locator('#rem-note').count() else None
pg.click('[role=dialog] button:has-text("Add reminder")'); h.wait(600)
h.check('reminder: shown in the day sheet with its time', 'Dentist' in pg.locator('[role=dialog]').inner_text() and '14:30' in pg.locator('[role=dialog]').inner_text())
# edit reminder
pg.get_by_label('Edit Dentist').click(); h.wait(400)
h.check('reminder edit: form opens prefilled', pg.input_value('#rem-title')=='Dentist')
pg.fill('#rem-title','Dentist visit'); pg.click('[role=dialog] button:has-text("Save changes")'); h.wait(600)
h.check('reminder edit: change saved', 'Dentist visit' in pg.locator('[role=dialog]').inner_text())
# edit task from the day sheet
pg.get_by_label('Edit Calendar task').click(); h.wait(500)
h.check('day sheet: Edit opens the task editor', pg.input_value('#title')=='Calendar task' and 'Edit task' in pg.locator('[role=dialog]').inner_text())
pg.fill('#title','Calendar task v2'); pg.locator('[role=dialog] button:has-text("Save changes")').click(); h.wait(700)
h.check('day sheet: edited task saved', 'Calendar task v2' in pg.locator('[role=dialog]').inner_text())
# delete with confirmation
pg.get_by_label('Delete Dentist visit').click(); h.wait(300)
h.check('reminder delete: asks for confirmation first', pg.locator('[role=dialog] button:has-text("Delete")').count()>=1 and 'Dentist visit' in pg.locator('[role=dialog]').inner_text())
pg.locator('[role=dialog] button:has-text("Delete")').first.click(); h.wait(500)
h.check('reminder delete: removed after confirming', 'Dentist visit' not in pg.locator('[role=dialog]').inner_text())
pg.get_by_label('Delete Calendar task v2').click(); h.wait(300); pg.locator('[role=dialog] button:has-text("Delete")').first.click(); h.wait(500)
h.check('task delete from the day sheet works', 'Calendar task v2' not in pg.locator('[role=dialog]').inner_text())
pg.locator('[role=dialog] button:has-text("Close")').click(); h.wait(300)

# --- due-tomorrow reminder pops up (and waits for dialogs to close)
tm=today+timedelta(days=1)
pg.get_by_label(lab(tm)).click(); h.wait(300)
pg.click('button:has-text("Add task or reminder")'); pg.click('[role=dialog] [role=tab]:has-text("Reminder")'); pg.fill('#rem-title','Pay rent'); pg.fill('#rem-time','09:00')
pg.click('[role=dialog] button:has-text("Add reminder")'); h.wait(700)
h.check('popup waits while the day sheet is still open', pg.locator('[role=alertdialog]').count()==0)
pg.locator('[role=dialog] button:has-text("Close")').click(); h.wait(900)
h.check('popup: reminder due tomorrow pops up after the sheet closes', 'Pay rent' in (pg.locator('[role=alertdialog]').inner_text() if pg.locator('[role=alertdialog]').count() else ''))
pg.locator('button:has-text("Got it")').click(); h.wait(400)
h.check('popup: does not pop up again once dismissed', pg.locator('[role=alertdialog]').count()==0)

# --- agenda view
pg.locator('button:has-text("Agenda")').click(); h.wait(500)
t=h.body()
h.check('agenda: lists upcoming items by day', 'Pay rent' in t and 'Beta launch' in t)
pg.locator('button:has-text("Month")').click(); h.wait(300)
h.check('calendar: can switch back to the month view', pg.get_by_label(lab(today)).count()==1)
# dots/markers
h.check('calendar: a day with items is visibly marked', pg.get_by_label(lab(tm)).inner_text().strip()!=str(tm.day) or pg.get_by_label(lab(tm)).locator('span,div').count()>1)
h.done()
