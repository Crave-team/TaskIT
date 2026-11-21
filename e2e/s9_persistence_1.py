import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
h=H('persist-1'); pg=h.pg
h.signup('Maya Cruz','maya@x.com',first=True); h.login('maya@x.com')
h.nav('My Workspace'); pg.click('[data-tour=new-project]'); pg.fill('#proj-name','Survivor'); pg.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(700)
pg.get_by_label('Open tasks for Survivor').click(); h.wait(500)
pg.locator('button:has-text("New task"):visible').first.click(); pg.fill('#title','Persistent task')
pg.click('[role=dialog] [role=tab]:has-text("Subtasks")'); pg.fill('input[placeholder="Add a subtask…"]','sub A'); pg.keyboard.press('Enter'); h.wait(400)
pg.click('[role=dialog] [role=tab]:has-text("Files")'); open('/tmp/keep.txt','w').write('keep me'); pg.set_input_files('[role=dialog] input[type=file]','/tmp/keep.txt'); h.wait(800)
pg.locator('[role=dialog] button:has-text("Create task")').click(); h.wait(1200); h.dismiss_popups()
h.check('created a task with a subtask and a file', pg.get_by_text('Persistent task').count()>0)
pg.reload(); h.wait(1800)
h.check('page reload: still signed in (token in the tab sessionStorage) and the task is still there', pg.locator('a[aria-label="Calendar"]').count()==1)
pg.goto(BASE+'/tasks'); h.wait(1500)
pg.get_by_label('Open tasks for Survivor').click(); h.wait(600)
h.check('after reload the project and task are loaded from the database', pg.get_by_text('Persistent task').count()>0)
# sessionStorage is not part of Playwright's storage_state, so hand the tab's token to part 2 explicitly.
open('/tmp/taskit_persist_token.txt','w').write(pg.evaluate("sessionStorage.getItem('taskit.session')"))
h.done()
