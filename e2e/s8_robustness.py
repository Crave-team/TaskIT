import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
from datetime import date, timedelta
d=lambda n:(date.today()+timedelta(days=n)).isoformat()
h=H('8-robustness'); pg=h.pg
dialogs=[]
# Every task this script creates is due today, so the app's "Due today" reminder pops up again and again. That is correct
# behaviour, but its backdrop would block the next click: close any such pop-up before each page change.
_nav = h.nav
def nav_clear(*a, **k):
    h.dismiss_popups()
    return _nav(*a, **k)
h.nav = nav_clear
pg.on('dialog', lambda dlg: (dialogs.append(dlg.message), dlg.dismiss()))   # any alert() = script executed
h.signup('Maya Cruz','maya@x.com',first=True); h.login('maya@x.com')
h.nav('My Workspace'); pg.click('[data-tour=new-project]'); h.wait(300)
XSS='<img src=x onerror=alert(1)><script>alert(2)</script>'
pg.fill('#proj-name',XSS); pg.fill('#proj-desc','<b onmouseover=alert(3)>desc</b>')
pg.locator('[role=dialog] button:has-text("Create")').last.dblclick(); h.wait(900)
h.check('double-click Create project makes ONE project', pg.locator('[aria-label^="Open tasks for"]').count()==1, pg.locator('[aria-label^="Open tasks for"]').count())
h.check('hostile project name is shown as plain text, never executed', XSS in h.body() and not dialogs, dialogs)
pg.locator('[aria-label^="Open tasks for"]').first.click(); h.wait(500)
pg.locator('button:has-text("New task"):visible').first.click(); h.wait(300)
pg.fill('#title', XSS)
pg.locator('[role=dialog] button:has-text("Create task")').dblclick(); h.wait(1200)
n=pg.locator('[draggable=true]').count()
h.check('double-click Create task makes ONE task', n==1, n)
h.check('hostile task title is rendered as text', not dialogs and XSS in h.body())
# long title / unicode
long='L'*400+' 日本語 🚀 émoji'
h.dismiss_popups()   # a task due today makes the "Due today" reminder pop up; close it before the next click
pg.locator('button:has-text("New task"):visible').first.click(); h.wait(300); pg.fill('#title', long); pg.locator('[role=dialog] button:has-text("Create task")').click(); h.wait(900)
ow=pg.evaluate("({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth})")
h.check('a 400-character title does not break the page layout', ow['sw']<=ow['cw']+1, ow)
h.check('unicode / emoji titles are stored intact', '日本語' in h.body() and '🚀' in h.body())
# reminder double submit + hostile text
h.nav('Calendar'); tm=date.today()+timedelta(days=3)
pg.get_by_label(f"Open {tm.strftime('%A, %B')} {tm.day}").click(); h.wait(300)
pg.click('button:has-text("Add task or reminder")'); pg.click('[role=dialog] [role=tab]:has-text("Reminder")'); pg.fill('#rem-title',XSS)
pg.locator('[role=dialog] button:has-text("Add reminder")').dblclick(); h.wait(900)
if pg.locator('[role=dialog]').count(): pg.keyboard.press('Escape'); h.wait(300)
cell=pg.get_by_label(f"Open {tm.strftime('%A, %B')} {tm.day}").inner_text()
cnt=cell.count('onerror=alert(1)')
h.check('double-click Add reminder makes ONE reminder', cnt==1, cell)
h.check('hostile reminder text is inert', not dialogs)

# team + chat
h.nav('Team'); pg.click('[data-tour=team-create]'); pg.fill('#grp-name',XSS)
pg.locator('[role=dialog] button:has-text("Create")').last.dblclick(); h.wait(1000)
h.check('hostile team name rendered as text', not dialogs)
pg.click('[role=tab]:has-text("Chat")'); h.wait(300)
pg.fill('textarea[aria-label="Message the team"]','<img src=x onerror=alert(9)>'); pg.keyboard.press('Enter'); pg.keyboard.press('Enter'); h.wait(700)
msgs=pg.locator('[role=log] >> text=<img src=x onerror=alert(9)>').count()
h.check('chat: hostile message is inert text, and Enter-spam sends it once', not dialogs and msgs==1, (dialogs, msgs))
# rapid navigation does not crash
for _ in range(3):
    for name in ['Dashboard','My Workspace','Calendar','Team']: pg.click(f'a[aria-label="{name}"]'); h.wait(120)
h.check('rapid navigation across pages stays stable', pg.locator('a[aria-label="Calendar"]').count()==1)
# open the same modal twice quickly / Escape handling
pg.click('a[aria-label="Calendar"]'); h.wait(300)
h.check('no JS alerts were ever triggered by hostile input', not dialogs, dialogs)
h.done()
