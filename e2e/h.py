import json, re, time, os
from playwright.sync_api import sync_playwright
BASE=__import__('os').environ.get('E2E_BASE','http://127.0.0.1:4173')
HERE=os.path.dirname(os.path.abspath(__file__))
RESULTS=os.path.join(HERE,'results.jsonl')

def reset_db():
    """With a real backend (E2E_RESET=1) the data survives page reloads, so each scenario starts from an empty database."""
    if os.environ.get('E2E_RESET'):
        import urllib.request
        urllib.request.urlopen(urllib.request.Request(BASE+'/api/test/reset', method='POST', headers={'X-Requested-With':'taskit'}))

class H:
    def __init__(self, area, viewport=None):
        reset_db()
        self.area=area
        self.p=sync_playwright().start()
        self.b=self.p.chromium.launch()
        self.ctx=self.b.new_context(viewport=viewport or {'width':1280,'height':900})
        self.pg=self.ctx.new_page()
        self.errs=[]
        self.pg.on('pageerror', lambda e: self.errs.append('pageerror: '+str(e)))
        self.pg.on('console', lambda m: self.errs.append('console: '+m.text) if (m.type=='error' and 'ERR_NAME_NOT_RESOLVED' not in m.text and 'Failed to load resource' not in m.text) else None)
        self.fails=0; self.n=0
    def check(self, name, cond, detail=''):
        self.n+=1; ok=bool(cond)
        if not ok:
            self.fails+=1
            try: self.pg.screenshot(path=os.path.join(HERE,"shots",f"{self.area}_{self.n}.png"))
            except Exception: pass
        print(('PASS ' if ok else 'FAIL ')+f'[{self.area}] {name}'+(f'  -> {detail}' if (detail and not ok) else ''))
        with open(RESULTS,'a') as f: f.write(json.dumps({'area':self.area,'name':name,'ok':ok,'detail':str(detail)})+'\n')
        return ok
    def done(self):
        self.check('no uncaught JS errors / console errors in this area', not self.errs, self.errs[:3])
        print(f'== {self.area}: {self.n-self.fails}/{self.n} passed')
        self.b.close(); self.p.stop()
    # ---- helpers
    def wait(self, ms=400): time.sleep(ms/1000)
    def skip_tour(self):
        s=self.pg.get_by_role('button', name=re.compile('skip', re.I))
        if s.count(): s.first.click(); self.wait(300)
    def signup(self, name, email, pw='password123', first=False):
        pg=self.pg
        if first: pg.goto(BASE+'/?auth=signup')
        else:
            if pg.viewport_size['width']<700: pg.click('button[aria-label="Open menu"]'); self.wait(400)
            pg.locator('header button:has-text("Sign up"):visible').last.click()
        pg.wait_for_selector('#signup-name')
        pg.fill('#signup-name',name); pg.fill('#signup-email',email); pg.fill('#signup-password',pw); pg.fill('#signup-confirm',pw)
        pg.click('button:has-text("Create account")'); pg.wait_for_selector('#login-email')
    def login(self, email, pw='password123', admin=False):
        pg=self.pg
        pg.fill('#login-email',email); pg.fill('#login-password',pw)
        pg.click('[role=dialog] button[type=submit]')
        pg.wait_for_url('**/dashboard'); self.wait(1200); self.skip_tour()
    def open_login(self):
        if self.pg.viewport_size['width']<700: self.pg.click('button[aria-label="Open menu"]'); self.wait(400)
        self.pg.locator('header button:has-text("Log in"):visible').last.click(); self.pg.wait_for_selector('#login-email')
    def relogin(self, email, pw='password123'):
        self.open_login(); self.login(email, pw)
    def logout(self):
        self.pg.click('button[aria-label="Profile menu"]'); self.pg.click('text=Log out'); self.wait(600)
    def nav(self, label): self.pg.click(f'a[aria-label="{label}"]'); self.wait(500)
    def admin_signup(self, name='Site Admin', email='boss@site.com', pw='password123'):
        pg=self.pg
        pg.goto(BASE+'/?auth=admin'); pg.wait_for_selector('#login-email')
        pg.click('button:has-text("Create an admin account")'); pg.wait_for_selector('#signup-invite')
        pg.fill('#signup-name',name); pg.fill('#signup-email',email); pg.fill('#signup-password',pw); pg.fill('#signup-confirm',pw); pg.fill('#signup-invite','ADMIN-2026')
        pg.click('button:has-text("Create admin account")'); pg.wait_for_selector('#login-email')
        pg.fill('#login-email',email); pg.fill('#login-password',pw); pg.click('[role=dialog] button[type=submit]')
        pg.wait_for_url('**/dashboard'); self.wait(1200)
    def app_goto(self, path):
        """Client-side navigation (no reload, so the in-memory data survives)."""
        self.pg.evaluate("""p => {
            const idx = (window.history.state && window.history.state.idx || 0) + 1;
            window.history.pushState({ usr: null, key: 'e2e' + idx, idx }, '', p);
            window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
        }""", path); self.wait(700)
    def dismiss_popups(self):
        """Closes the overdue / due-tomorrow reminder pop-ups if they are showing."""
        for _ in range(3):
            if self.pg.locator('[role=alertdialog]').count():
                self.pg.locator('button:has-text("Got it"), button:has-text("Dismiss"), button:has-text("Close")').last.click(); self.wait(400)
    def path(self): return self.pg.evaluate('location.pathname')
    def href(self): return self.pg.evaluate('location.href')
    def body(self): return self.pg.locator('body').inner_text()
