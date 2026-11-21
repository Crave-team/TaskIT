import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import os; os.environ.pop('E2E_RESET',None)
from h import *
from playwright.sync_api import sync_playwright
p=sync_playwright().start(); b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1280,'height':900}); pg=ctx.new_page()
# The same tab, still open across the restart: give it back the token its sessionStorage held.
TOKEN=open('/tmp/taskit_persist_token.txt').read().strip()
ctx.add_init_script("sessionStorage.setItem('taskit.session', '"+TOKEN+"')")
pg.goto(BASE+'/tasks'); time.sleep(2)
res=[]
def chk(n,c): print(('PASS ' if c else 'FAIL ')+'[persist-2] '+n); res.append(c)
chk('after a FULL SERVER RESTART the same tab is still signed in (session stored in MongoDB)', pg.locator('a[aria-label="Calendar"]').count()==1)
pg.get_by_label('Open tasks for Survivor').click(); time.sleep(1)
chk('the project and task survived the restart', pg.get_by_text('Persistent task').count()>0)
pg.get_by_text('Persistent task').first.click(); time.sleep(0.8)
pg.click('[role=dialog] [role=tab]:has-text("Subtasks")'); time.sleep(0.4)
chk('its subtask survived', 'sub A' in pg.locator('[role=dialog]').inner_text())
pg.click('[role=dialog] [role=tab]:has-text("Files")'); time.sleep(0.4)
chk('its attached file is still listed', 'keep.txt' in pg.locator('[role=dialog]').inner_text())
content=pg.evaluate("""async () => {
  const auth = { Authorization: 'Bearer ' + sessionStorage.getItem('taskit.session') };
  const snap = (await (await fetch('/api/bootstrap', {headers: auth})).json()).data;
  const url = snap.tasks.flatMap(t => t.attachments)[0]?.url;
  if (!url) return 'no attachment url';
  const r = await fetch(url, {headers: auth});
  return r.ok ? await r.text() : 'HTTP ' + r.status;
}""")
chk('the file BYTES survived on disk and download correctly ("keep me")', content=='keep me')
print('RESULT', all(res)); b.close(); p.stop()
