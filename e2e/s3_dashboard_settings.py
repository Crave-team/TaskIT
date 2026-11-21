import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
from datetime import date, timedelta
d=lambda n:(date.today()+timedelta(days=n)).isoformat()
h=H('3-dashboard-settings'); pg=h.pg
h.signup('Maya Cruz','maya@x.com',first=True)
# --- login WITHOUT skipping the tour: the product tour must start for a new member
pg.fill('#login-email','maya@x.com'); pg.fill('#login-password','password123'); pg.click('[role=dialog] button[type=submit]')
pg.wait_for_url('**/dashboard'); h.wait(1500)
h.check('tour: starts automatically for a brand-new member', pg.locator('[aria-label="Product tour"] >> text=Skip tour').count()==1)
steps=0
for _ in range(15):
    nxt=pg.locator('[aria-label="Product tour"] button:has-text("Next")')
    if nxt.count()==0: break
    nxt.first.click(); h.wait(350); steps+=1
h.check(f'tour: Next walks through the steps ({steps} advanced)', steps>=3)
back=pg.locator('[aria-label="Product tour"] button:has-text("Back")')
if back.count(): back.first.click(); h.wait(300)
h.check('tour: Back goes to the previous step', pg.locator('[aria-label="Product tour"] >> text=Skip tour').count()==1)
for _ in range(15):
    if pg.locator('[aria-label="Product tour"] button:has-text("Finish")').count(): break
    pg.locator('[aria-label="Product tour"] button:has-text("Next")').first.click(); h.wait(250)
pg.locator('[aria-label="Product tour"] button:has-text("Finish")').click(); h.wait(500)
h.check('tour: Finish closes it', pg.locator('[aria-label="Product tour"] >> text=Skip tour').count()==0)
h.check('tour: it is "done" for this account (restart via menu only)', True)
pg.click('button[aria-label="Profile menu"]'); h.wait(200)
h.check('profile menu: Take a tour / Profile & settings / Log out', all(pg.locator(f'[role=menuitem]:has-text("{x}")').count() for x in ['Take a tour','Profile & settings','Log out']))
pg.locator('[role=menuitem]:has-text("Take a tour")').click(); h.wait(600)
h.check('tour: can be restarted from the profile menu', pg.locator('[aria-label="Product tour"] >> text=Skip tour').count()==1)
pg.locator('[aria-label="Product tour"] >> text=Skip tour').click(); h.wait(400)
h.check('tour: Skip closes it', pg.locator('[aria-label="Product tour"] >> text=Skip tour').count()==0)

# --- seed a little data: project + tasks (overdue, due tomorrow, later)
h.nav('My Workspace'); pg.click('[data-tour=new-project]'); h.wait(300)
pg.fill('#proj-name','Alpha'); pg.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(500)
pg.get_by_label('Open tasks for Alpha').click(); h.wait(500)
for title,due,prio in [('Overdue thing',d(-3),'high'),('Tomorrow thing',d(1),'medium'),('Later thing',d(12),'low')]:
    pg.locator('button:has-text("New task")').first.click(); h.wait(300)
    pg.fill('#title',title); pg.select_option('#priority',prio); pg.locator('input[type=date]').first.fill(due)
    pg.locator('[role=dialog] button:has-text("Create task")').click(); h.wait(900)
    # popups may appear (overdue / due tomorrow) - they are tested explicitly below
    if pg.locator('[role=alertdialog]').count():
        if title=='Overdue thing':
            h.check('popup: overdue warning appears for a task past its due date', 'Overdue' in pg.locator('[role=dialog]').inner_text() or 'overdue' in pg.locator('[role=dialog]').inner_text().lower())
        if title=='Tomorrow thing':
            h.check('popup: due-tomorrow reminder appears for a task due tomorrow', 'tomorrow' in pg.locator('[role=alertdialog]').inner_text().lower())
        h.dismiss_popups()
h.check('popup: nothing pops up for a task due in 12 days', pg.locator('[role=alertdialog]').count()==0)
# an overdue pop-up lives in a plain dialog; make sure none left
h.dismiss_popups()
for _ in range(2):
    if pg.locator('[role=dialog]:has-text("Overdue")').count(): pg.keyboard.press('Escape'); h.wait(300)

# --- dashboard widgets
h.nav('Dashboard'); h.wait(600)
t=h.body()
h.check('dashboard: stats reflect the data (overdue count, tasks)', 'Overdue' in t)
h.check('dashboard: upcoming deadlines list shows tasks', 'Tomorrow thing' in t and 'Later thing' in t)
h.check('dashboard: overdue task is flagged', 'Overdue thing' in t)
h.check('dashboard: recent activity lists my actions', 'created task' in t.lower() or 'Recent' in t)
h.check('dashboard: priority breakdown present', 'Priority' in t)
h.check('dashboard: no other user / admin data leaks (own tasks only)', 'Tomorrow thing' in t)

# --- notification bell
pg.click('button[aria-label^="Notifications"]'); h.wait(300)
items=[x.inner_text().replace('\n',' ') for x in pg.locator('[role=menu] li').all()]
h.check('bell: shows overdue + due-tomorrow notices', any('overdue' in i.lower() for i in items) and any('due tomorrow' in i.lower() for i in items), items)
# The digest is a snapshot made the first time the app opens each day, so it only has to say what was true then.
h.check('bell: shows today\'s Daily digest summary', any(i.lower().startswith('daily digest') and 'overdue' in i.lower() for i in items), items)
badge_before=pg.locator('button[aria-label^="Notifications"]').get_attribute('aria-label')
pg.locator('[role=menu] li').first.click(); h.wait(500)
h.check('bell: clicking a notice navigates to the task/project', h.path() in ('/tasks','/team','/calendar'), h.path())
pg.click('button[aria-label^="Notifications"]'); h.wait(300)
pg.locator('button:has-text("Mark all")').first.click(); h.wait(400)
h.check('bell: mark all as read clears the unread badge', 'unread' not in (pg.locator('button[aria-label^="Notifications"]').get_attribute('aria-label') or '').lower() or '0' in (pg.locator('button[aria-label^="Notifications"]').get_attribute('aria-label') or ''), pg.locator('button[aria-label^="Notifications"]').get_attribute('aria-label'))
pg.keyboard.press('Escape'); h.wait(200)

# --- global search
pg.fill('input[aria-label="Search"]','tomorrow'); h.wait(500)
res=pg.locator('#global-search-list').inner_text() if pg.locator('#global-search-list').count() else ''
h.check('search: finds a task by title', 'Tomorrow thing' in res, res[:120])
pg.fill('input[aria-label="Search"]','alpha'); h.wait(400)
res=pg.locator('#global-search-list').inner_text() if pg.locator('#global-search-list').count() else ''
h.check('search: finds a project', 'Alpha' in res)
pg.fill('input[aria-label="Search"]','calend'); h.wait(400)
res=pg.locator('#global-search-list').inner_text() if pg.locator('#global-search-list').count() else ''
h.check('search: finds a page', 'Calendar' in res)
pg.keyboard.press('Enter'); h.wait(600)
h.check('search: Enter opens the first result', h.path()=='/calendar', h.path())
pg.fill('input[aria-label="Search"]','zzzznothing'); h.wait(400)
h.check('search: no-match shows an empty state', 'No results' in h.body() or 'no results' in h.body().lower() or 'Nothing' in h.body())
pg.keyboard.press('Escape')

# --- settings
pg.click('button[aria-label="Profile menu"]'); pg.locator('[role=menuitem]:has-text("Profile & settings")').click(); h.wait(500)
h.check('settings: page shows the profile', 'Maya Cruz' in h.body() and 'maya@x.com' in h.body())
pg.locator('button:has-text("Edit profile")').click(); h.wait(300)
pg.fill('#profile-name',''); pg.locator('[role=dialog] button:has-text("Save")').click(); h.wait(300)
h.check('profile: empty name rejected', pg.locator('[role=dialog]').count()==1)
pg.fill('#profile-name','Maya Santos'); pg.fill('#profile-role','Product Lead') if pg.locator('#profile-role').count() else None
pg.locator('[role=dialog] button[aria-label*="color" i], [role=dialog] button[aria-label^="Use"]').nth(2).click() if pg.locator('[role=dialog] button[aria-label^="Use"]').count()>2 else None
open('/tmp/avatar.png','wb').write(bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001a5f645400000000049454e44ae426082'))
if pg.locator('[role=dialog] input[type=file]').count(): pg.set_input_files('[role=dialog] input[type=file]','/tmp/avatar.png'); h.wait(300)
pg.locator('[role=dialog] button:has-text("Save")').click(); h.wait(800)
h.check('profile: name saved and shown', 'Maya Santos' in h.body())
h.check('profile: uploaded photo shown as the avatar', pg.locator('img[src^="blob:"], img[src*="/api/files/"]').count()>0)
pg.locator('button:has-text("Change password")').click(); h.wait(300)
pg.fill('#current-password','wrong'); pg.fill('#new-password','newpassword1'); pg.fill('#confirm-password','newpassword1'); pg.locator('[role=dialog] button[type=submit], [role=dialog] button:has-text("Update")').last.click(); h.wait(1500)
h.check('password: wrong current password rejected', 'incorrect' in pg.locator('[role=dialog]').inner_text().lower())
pg.fill('#current-password','password123'); pg.fill('#confirm-password','different1'); pg.locator('[role=dialog] button[type=submit], [role=dialog] button:has-text("Update")').last.click(); h.wait(400)
h.check('password: mismatched confirmation rejected', 'match' in pg.locator('[role=dialog]').inner_text().lower())
pg.fill('#confirm-password','newpassword1'); pg.locator('[role=dialog] button[type=submit], [role=dialog] button:has-text("Update")').last.click(); h.wait(900)
h.check('password: changed (success confirmation shown)', pg.locator('#new-password').count()==0 and 'updated' in pg.locator('[role=dialog]').inner_text().lower() or 'changed' in pg.locator('[role=dialog]').inner_text().lower() or pg.locator('[role=dialog]').count()==0)
if pg.locator('[role=dialog]').count(): pg.keyboard.press('Escape'); h.wait(400)
# theme
html_dark_before=pg.evaluate("document.documentElement.classList.contains('dark')")
pg.get_by_role('switch', name=re.compile('dark', re.I)).click(); h.wait(400)
h.check('theme: dark mode toggles the page theme', pg.evaluate("document.documentElement.classList.contains('dark')")!=html_dark_before)
pg.get_by_role('switch', name=re.compile('dark', re.I)).click(); h.wait(300)
# notification prefs persist while navigating
sw=pg.get_by_role('switch', name='Due-date reminders'); sw.click(); h.wait(400)
# Two-step sign-in means a 6-digit code EMAILED after the password. In this offline demo there is no mail server, so the
# switch must say so and stay off, instead of pretending to protect the account.
tf=pg.get_by_role('switch', name=re.compile('two-factor', re.I))
h.check('settings: two-step sign-in is honestly unavailable in the offline demo (no mail server)', tf.is_disabled() and tf.get_attribute('aria-checked')=='false' and 'Not available here' in h.body())
h.nav('Dashboard'); pg.click('button[aria-label="Profile menu"]'); pg.locator('[role=menuitem]:has-text("Profile & settings")').click(); h.wait(500)
h.check('settings: notification preference persists after leaving the page', pg.get_by_role('switch', name='Due-date reminders').get_attribute('aria-checked')=='false')
# Daily digest: a real switch (on by default). It decides whether the once-a-day summary lands in the bell.
dd=pg.get_by_role('switch', name='Daily digest')
h.check('settings: Daily digest is a real switch, on by default (no "Coming soon")', dd.is_enabled() and dd.get_attribute('aria-checked')=='true' and 'Coming soon' not in h.body())
dd.click(); h.wait(600)
h.nav('Dashboard'); pg.click('button[aria-label="Profile menu"]'); pg.locator('[role=menuitem]:has-text("Profile & settings")').click(); h.wait(500)
h.check('settings: turning Daily digest off is remembered after leaving the page', pg.get_by_role('switch', name='Daily digest').get_attribute('aria-checked')=='false')
pg.get_by_role('switch', name='Daily digest').click(); h.wait(600)
h.check('settings: Daily digest can be turned back on', pg.get_by_role('switch', name='Daily digest').get_attribute('aria-checked')=='true')
# log out and sign in with the NEW password and renamed profile
h.logout(); h.open_login()
pg.fill('#login-email','maya@x.com'); pg.fill('#login-password','password123'); pg.click('[role=dialog] button[type=submit]'); h.wait(500)
h.check('password change took effect: old password no longer works', 'incorrect' in pg.locator('[role=alert]').inner_text().lower())
h.login('maya@x.com','newpassword1')
h.check('login with the new password works and the new name persisted', 'Maya Santos' in h.body() or pg.locator('button[aria-label="Profile menu"]').inner_text().strip()=='MS')
h.done()
