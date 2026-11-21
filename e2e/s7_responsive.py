import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
from datetime import date, timedelta
def overflow(pg):
    return pg.evaluate("() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})")
def run(width, height, label):
    h=H(f'7-responsive-{label}', viewport={'width':width,'height':height}); pg=h.pg
    def no_overflow(name):
        o=overflow(pg); h.check(f'{label}: {name} has no horizontal overflow', o['sw']<=o['cw']+1, o)
    pg.goto(BASE+'/'); h.wait(600); no_overflow('homepage')
    h.check(f'{label}: homepage shows a way to log in', pg.locator('button:has-text("Log in")').count()>0)
    h.signup('Maya Cruz','maya@x.com'); 
    pg.fill('#login-email','maya@x.com'); pg.fill('#login-password','password123'); pg.click('[role=dialog] button[type=submit]'); pg.wait_for_url('**/dashboard'); h.wait(1500); h.skip_tour()
    no_overflow('dashboard')
    h.check(f'{label}: primary navigation reachable', pg.locator('a[aria-label="Calendar"]').count()>0 or pg.locator('button[aria-label*="menu" i]').count()>0)
    # data to make pages non-empty
    h.nav('My Workspace'); pg.click('[data-tour=new-project]'); h.wait(300); pg.fill('#proj-name','Alpha'); pg.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(500)
    no_overflow('projects')
    pg.get_by_label('Open tasks for Alpha').click(); h.wait(500)
    for i,tl in enumerate(['One','Two']):
        pg.locator('button:has-text("New task"):visible').first.click(); h.wait(300); pg.fill('#title',tl); pg.locator('[role=dialog] button:has-text("Create task")').click(); h.wait(800); h.dismiss_popups()
    no_overflow('kanban board')
    pg.get_by_label('List view').click(); h.wait(300); no_overflow('task list')
    pg.locator('button:has-text("New task"):visible').first.click(); h.wait(400)
    box=pg.locator('[role=dialog]').bounding_box()
    h.check(f'{label}: task dialog fits the screen', box and box['x']>=-1 and box['x']+box['width']<=width+1 and box['y']>=-1, box)
    pg.keyboard.press('Escape'); h.wait(300)
    h.nav('Calendar'); no_overflow('calendar')
    h.nav('Team'); no_overflow('team hub')
    pg.click('[data-tour=team-create]'); pg.fill('#grp-name','Crew'); pg.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(700)
    no_overflow('team workspace')
    for tabname in ['Chat','Projects','Announcements','Assign task','Reports','Members']:
        if pg.locator(f'[role=tab]:has-text("{tabname}")').count():
            pg.click(f'[role=tab]:has-text("{tabname}")'); h.wait(400); no_overflow(f'team tab {tabname}')
    h.nav('Dashboard'); pg.click('button[aria-label="Profile menu"]'); pg.locator('[role=menuitem]:has-text("Profile & settings")').click(); h.wait(500); no_overflow('settings')
    # ---- dark mode on every page
    pg.get_by_role('switch', name=re.compile('dark', re.I)).click(); h.wait(400)
    h.check(f'{label}: dark mode applies', pg.evaluate("document.documentElement.classList.contains('dark')"))
    for name in ['Dashboard','My Workspace','Calendar','Team']:
        h.nav(name); h.wait(300)
        bg=pg.evaluate("getComputedStyle(document.body).backgroundColor")
        o=overflow(pg)
        h.check(f'{label}: dark {name} renders without overflow', o['sw']<=o['cw']+1 and bg!='rgba(0, 0, 0, 0)', (o,bg))
    # contrast sanity: body text must not be dark-on-dark
    fg=pg.evaluate("getComputedStyle(document.querySelector('h1')||document.body).color")
    bgc=pg.evaluate("getComputedStyle(document.body).backgroundColor")
    def lum(c):
        n=[int(x) for x in re.findall(r'\d+',c)[:3]]; return sum(n)/3
    h.check(f'{label}: dark mode headings are lighter than the background', lum(fg)>lum(bgc)+60, (fg,bgc))
    h.done()
import os as _os
only=_os.environ.get('ONLY')
if only in (None,'phone'): run(390,844,'phone')
if only in (None,'tablet'): run(768,1024,'tablet')
