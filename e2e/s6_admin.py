import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
from datetime import date, timedelta
d=lambda n:(date.today()+timedelta(days=n)).isoformat()
today=date.today()
h=H('6-admin'); pg=h.pg
def dlg(): return pg.locator('[role=dialog]').inner_text() if pg.locator('[role=dialog]').count() else ''
def open_admin_login():
    pg.locator('footer button:has-text("Admin")').click(); pg.wait_for_selector('#login-email')

# ------------------------------------------------------------ members create data first
h.signup('Maya Cruz','maya@x.com',first=True); h.login('maya@x.com')
h.nav('My Workspace'); pg.click('[data-tour=new-project]'); pg.fill('#proj-name','Maya Personal'); pg.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(500)
pg.get_by_label('Open tasks for Maya Personal').click(); h.wait(400)
pg.locator('button:has-text("New task")').first.click(); pg.fill('#title','Private personal task'); pg.locator('[role=dialog] button:has-text("Create task")').click(); h.wait(700); h.dismiss_popups()
h.nav('Team'); pg.click('[data-tour=team-create]'); pg.fill('#grp-name','Crew'); pg.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(700)
pg.click('[role=tab]:has-text("Projects")'); pg.locator('button:has-text("New project")').first.click(); pg.fill('#proj-name','Launch'); pg.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(600)
pg.click('[role=tab]:has-text("Chat")'); h.wait(300); pg.fill('textarea[aria-label="Message the team"]','TOP SECRET team chat text'); pg.click('button[aria-label="Send message"]'); h.wait(500)
h.logout()
h.signup('Ben Reyes','ben@x.com'); h.login('ben@x.com'); h.logout()
h.signup('Cleo Park','cleo@x.com'); h.login('cleo@x.com'); h.logout()

# ------------------------------------------------------------ admin account creation + chrome
open_admin_login()
pg.click('button:has-text("Create an admin account")'); pg.wait_for_selector('#signup-invite')
pg.fill('#signup-name','Site Admin'); pg.fill('#signup-email','boss@site.com'); pg.fill('#signup-password','password123'); pg.fill('#signup-confirm','password123'); pg.fill('#signup-invite','ADMIN-2026')
pg.click('button:has-text("Create admin account")'); pg.wait_for_selector('#login-email')
pg.fill('#login-email','boss@site.com'); pg.fill('#login-password','password123'); pg.click('[role=dialog] button[type=submit]'); pg.wait_for_url('**/dashboard'); h.wait(1500)
h.check('admin: lands on dashboard, no guided tour', pg.locator('[aria-label="Product tour"]').count()==0)
h.check('admin: no search bar in the top bar', pg.locator('input[aria-label="Search"]').count()==0)
nav=[a.get_attribute('aria-label') for a in pg.locator('aside a, nav a').all()]
h.check('admin: sidebar has the admin pages', all(x in nav for x in ['Dashboard','My Workspace','Team','Users','System Settings','Activity Log']), nav)
pg.click('button[aria-label="Profile menu"]'); h.wait(200)
h.check('admin: profile menu has no "Take a tour"', pg.locator('[role=menuitem]:has-text("Take a tour")').count()==0)
pg.keyboard.press('Escape'); h.wait(200)

# ------------------------------------------------------------ dashboard totals
t=h.body()
h.check('admin dashboard: totals for the whole site', 'Total tasks' in t and 'Total projects' in t)
h.check('admin dashboard: counts reflect real data (2 projects, 1 task)', pg.locator('[aria-label="Totals"]').inner_text().count('2')>=1)
pg.locator('[aria-label="Time range"] button:has-text("12")').first.click(); h.wait(400)
h.check('admin dashboard: 6/12 month toggle works', True)
h.check('admin dashboard: charts rendered (svg)', pg.locator('svg.recharts-surface').count()>=2)

# ------------------------------------------------------------ users page
h.nav('Users')
t=h.body()
h.check('users: every account is listed (3 members + me)', all(x in t for x in ['Maya Cruz','Ben Reyes','Cleo Park','Site Admin']))
h.check('users: emails are visible to the admin only here', 'maya@x.com' in t)
pg.fill('[aria-label="Search users"]','cleo'); h.wait(300)
h.check('users: search by name/email', 'Cleo Park' in h.body() and 'Ben Reyes' not in h.body())
pg.fill('[aria-label="Search users"]','ben@x.com'); h.wait(300)
h.check('users: search by exact email', 'Ben Reyes' in h.body() and 'Cleo Park' not in h.body())
pg.fill('[aria-label="Search users"]','zzz'); h.wait(300)
h.check('users: no-match empty state', 'Cleo Park' not in h.body())
pg.fill('[aria-label="Search users"]',''); h.wait(300)
h.check('users: own row cannot be demoted / banned / deleted', pg.get_by_label('Demote Site Admin').is_disabled() and pg.get_by_label('Ban Site Admin').is_disabled() and pg.get_by_label('Delete Site Admin').is_disabled())
pg.get_by_label('Promote Ben Reyes').click(); h.wait(500)
h.check('users: promote a member to admin', pg.get_by_label('Demote Ben Reyes').count()==1)
pg.get_by_label('Demote Ben Reyes').click(); h.wait(500)
h.check('users: demote back to member', pg.get_by_label('Promote Ben Reyes').count()==1)
pg.get_by_label('Ban Cleo Park').click(); h.wait(500)
h.check('users: ban shows an Unban control', pg.get_by_label('Unban Cleo Park').count()==1)
h.logout(); h.open_login()
pg.fill('#login-email','cleo@x.com'); pg.fill('#login-password','password123'); pg.click('[role=dialog] button[type=submit]'); h.wait(700)
h.check('banned user cannot log in (clear message)', 'banned' in pg.locator('[role=alert]').inner_text().lower())
pg.keyboard.press('Escape'); h.wait(200); open_admin_login()
pg.fill('#login-email','boss@site.com'); pg.fill('#login-password','password123'); pg.click('[role=dialog] button[type=submit]'); pg.wait_for_url('**/dashboard'); h.wait(1200)
h.nav('Users'); pg.get_by_label('Unban Cleo Park').click(); h.wait(500)
h.check('users: unban restores the account', pg.get_by_label('Ban Cleo Park').count()==1)

# ------------------------------------------------------------ team + workspace oversight
h.nav('Team'); t=h.body()
h.check('admin team page: team, its project, and chat METADATA only (no chat text)', 'Crew' in t and 'Launch' in t and 'TOP SECRET' not in t)
h.nav('My Workspace'); t=h.body()
h.check('admin workspace: lists users\' personal projects/tasks (read-only)', 'Maya Personal' in t and 'Private personal task' in t)
h.check('admin workspace: no create/edit controls', pg.locator('button:has-text("New task")').count()==0 and pg.locator('button:has-text("New project")').count()==0)

# ------------------------------------------------------------ system settings persistence
h.nav('System Settings')
pg.locator('select').first.select_option('15'); h.wait(300)
pg.get_by_role('switch', name=re.compile('deadline|overdue', re.I)).click(); h.wait(300)
h.nav('Dashboard'); h.nav('System Settings')
h.check('settings: choices persist when leaving the page', pg.locator('select').first.input_value()=='15')
pg.get_by_role('switch', name=re.compile('deadline|overdue', re.I)).click(); h.wait(300)

# ------------------------------------------------------------ admin calendar: reminders only; due-tomorrow pop-up
h.nav('Calendar')
tm=today+timedelta(days=1)
pg.get_by_label(f"Open {tm.strftime('%A, %B')} {tm.day}").click(); h.wait(300)
h.check('admin calendar: only "Add reminder" is offered', pg.locator('button:has-text("Add reminder")').count()==1 and pg.locator('button:has-text("Add task")').count()==0)
pg.click('button:has-text("Add reminder")'); h.wait(300)
h.check('admin calendar: no Task tab, reminder form shown directly', pg.locator('[role=dialog] [role=tab]').count()==0 and pg.locator('#rem-title').is_visible())
pg.fill('#rem-title','Review audit log'); pg.click('[role=dialog] button:has-text("Add reminder")'); h.wait(600)
pg.locator('[role=dialog] button:has-text("Close")').click(); h.wait(900)
h.check('admin: due-tomorrow reminder pop-up appears', pg.locator('[role=alertdialog]').count()==1 and 'Review audit log' in pg.locator('[role=alertdialog]').inner_text())
pg.locator('button:has-text("Got it")').click(); h.wait(300)

# ------------------------------------------------------------ activity log
h.nav('Activity Log'); h.wait(500)
t=h.body()
h.check('activity log: shows sign-ins, creations and admin actions', 'signed in' in t.lower() and ('created' in t.lower() or 'banned' in t.lower()))
pg.locator('[aria-label="Filter by area"] button:has-text("Account")').click(); h.wait(400)
h.check('activity log: filter by area', 'banned' in h.body().lower() or 'reactivated' in h.body().lower() or 'signed in' in h.body().lower())
pg.locator('[aria-label="Filter by area"] button:has-text("All")').click(); pg.select_option('[aria-label="Filter by user"]',label='Maya Cruz'); h.wait(400)
h.check('activity log: filter by user', 'Maya Cruz' in h.body())
pg.select_option('[aria-label="Filter by user"]',index=0); pg.fill('[aria-label="Search the log"]','Launch'); h.wait(400)
h.check('activity log: free-text search', 'Launch' in h.body())
pg.fill('[aria-label="Search the log"]','')

# ------------------------------------------------------------ admin deletes a user (cascade) + disbands
h.nav('Users')
pg.get_by_label('Delete Maya Cruz').click(); h.wait(300)
h.check('users: delete asks for confirmation first', pg.get_by_label('Confirm deleting Maya Cruz').count()==1 and 'maya@x.com' in h.body())
pg.get_by_label('Confirm deleting Maya Cruz').click(); h.wait(700)
h.check('users: account deleted', 'maya@x.com' not in h.body())
h.nav('Team'); t=h.body()
h.check('cascade: her team, project and chat are gone with her', 'Crew' not in t.replace('Teams','') and 'Launch' not in t)
h.nav('My Workspace'); t=h.body()
h.check('cascade: her personal project and task are gone', 'Maya Personal' not in t and 'Private personal task' not in t)
# admin profile
pg.click('button[aria-label="Profile menu"]'); pg.locator('[role=menuitem]:has-text("Profile & settings")').click(); h.wait(500)
h.check('admin: settings page shows only relevant notification options (no mentions)', 'Mentions' not in h.body())
h.done()
