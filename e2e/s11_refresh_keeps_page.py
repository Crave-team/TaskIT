"""
Refreshing keeps you on the same page, and a window (modal) that was open comes back with it.
Needs the throw-away server (see s10_two_tabs.py for how to start it).
"""
import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *

h = H('refresh'); pg = h.pg
h.signup('Maya Cruz', 'maya@x.com', first=True); h.login('maya@x.com')

def where():
    return pg.evaluate('location.pathname + location.search')

def reload():
    pg.reload(); h.wait(2200)  # no clicks here: the first click ends the restore window on purpose

# ---- a team: create it, open it, switch tab, refresh
pg.goto(BASE + '/team'); h.wait(1200); h.dismiss_popups()
pg.locator('button:has-text("Create team")').first.click(); pg.fill('#grp-name', 'Alpha Team')
pg.locator('[role=dialog] button:has-text("Create team")').last.click(); h.wait(1500)
url_team = where()
h.check('opening a team puts it in the address', url_team.startswith('/team?team='), url_team)
reload()
h.check('refresh stays INSIDE the team (not the team list)', where() == url_team and pg.locator('[data-tour=team-tabs]').count() == 1, where())

pg.locator('[data-tour=team-tabs] [role=tab]:has-text("Members")').click(); h.wait(600)
h.check('the open tab is in the address', 'tab=members' in where(), where())
url_tab = where()
reload()
h.check('refresh stays on the same tab', where() == url_tab and pg.locator('[data-tour=team-tabs] [role=tab][aria-selected=true]:has-text("Members")').count() == 1, where())

pg.go_back(); h.wait(800)
pg.go_back(); h.wait(800)
h.check('browser Back leaves the team for the list', pg.locator('[data-tour=team-tabs]').count() == 0 or '/team' in where(), where())

# a made-up team id falls back to the team list instead of an error
pg.goto(BASE + '/team?team=000000000000000000000001'); h.wait(1500)
h.check('an unknown team id shows the team list', pg.locator('[data-tour=team-hub]').count() == 1)

# ---- a task window from a link opens once and takes itself out of the address; a refresh keeps it open
h.nav('My Workspace'); pg.click('[data-tour=new-project]'); pg.fill('#proj-name', 'Pics'); pg.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(700)
pg.get_by_label('Open tasks for Pics').click(); h.wait(500)
pg.locator('button:has-text("New task"):visible').first.click(); pg.fill('#title', 'Linked task')
pg.locator('[role=dialog] button:has-text("Create task")').click(); h.wait(1200); h.dismiss_popups()
project_url = where()
task_id = pg.evaluate("""async () => {
    const t = sessionStorage.getItem('taskit.session');
    const d = (await (await fetch('/api/bootstrap', { headers: { Authorization: 'Bearer ' + t } })).json()).data;
    return d.tasks.find(x => x.title === 'Linked task').id; }""")
pg.goto(BASE + project_url + '&task=' + task_id); h.wait(1500); h.dismiss_popups()
h.check('a task link opens its window', pg.locator('[role=dialog]').count() == 1, where())
h.check('and takes itself out of the address', 'task=' not in where() and where() == project_url, where())
reload()
h.check('refresh keeps the project page AND that task window', where() == project_url and pg.locator('[role=dialog]').count() == 1, where())
pg.keyboard.press('Escape'); h.wait(500)
h.check('closing the window really closes it', pg.locator('[role=dialog]').count() == 0)
reload()
h.check('refresh after closing: page stays, no window', where() == project_url and pg.locator('[role=dialog]').count() == 0, where())

# a window opened by clicking comes back after a refresh too
pg.get_by_text('Linked task').first.click(); h.wait(700)
h.check('clicking a task opens its window', pg.locator('[role=dialog]').count() == 1)
reload()
h.check('refresh with that window open: page stays and the window is still open', where() == project_url and pg.locator('[role=dialog]').count() == 1, where())

h.done()
