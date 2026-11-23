"""
Refreshing in DEVELOPMENT mode (`npm run dev`, where React starts every first request twice) with a slow database
must keep you signed in, on the same page, and must never flash the log-in popup. Needs two servers:
    E2E_DELAY_MS=600 PORT=3000 node server/test/e2e-tabs-server.mjs &
    VITE_API_URL=/api npx vite --port 4173 --host 127.0.0.1 --strictPort &
    python3 e2e/s15_dev_refresh.py
"""
import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *

h = H('dev-refresh'); pg = h.pg
h.signup('Maya Cruz', 'maya@x.com', first=True); h.login('maya@x.com')
for path in ['/dashboard', '/tasks', '/calendar', '/team', '/settings']:
    pg.goto(BASE + path); h.wait(2500)
    pg.reload(); h.wait(4500)
    now = pg.evaluate('location.pathname + location.search')
    h.check(f'{path}: a refresh stays on the page, signed in, no log-in popup', now == path and pg.locator('[role=dialog] #login-email').count() == 0, now)
h.done()
