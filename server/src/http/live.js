/**
 * Live updates by Server-Sent Events: a long-lived `GET /api/live` response per open tab, down which the server says
 * "something changed". The message carries NO data (just a counter), so nothing private can leak through it; on
 * seeing it the tab re-fetches its own permission-checked snapshot through the normal API.
 *
 * The hub lives in this server process's memory, so it works for ONE server process (how TaskIT is run). Running
 * several copies behind a load balancer would need a shared channel (e.g. MongoDB change streams) instead.
 */

/**
 * @param {{ heartbeatMs?: number, coalesceMs?: number, maxPerUser?: number }} [options]
 */
export function createLiveHub({ heartbeatMs = 25_000, coalesceMs = 150, maxPerUser = 8 } = {}) {
  /** @type {Set<{ res: import('node:http').ServerResponse, userId: string, token?: string, isValid: () => Promise<boolean> }>} */
  const clients = new Set();
  const writers = new Set(); // session tokens that caused a change in the current coalescing window
  let revision = 0;
  let flushTimer = null;
  let beat = null;

  const drop = (client) => {
    if (!clients.delete(client)) return;
    try { client.res.end(); } catch { /* already closed */ }
    if (clients.size === 0 && beat) { clearInterval(beat); beat = null; }
  };
  const send = (client, chunk) => {
    try { client.res.write(chunk); } catch { drop(client); }
  };

  const heartbeat = () => {
    for (const client of [...clients]) {
      // The comment line keeps proxies from closing an idle connection; the check ends streams whose session is gone.
      send(client, ': ping\n\n');
      Promise.resolve(client.isValid()).then((valid) => {
        if (!valid && clients.has(client)) {
          send(client, 'event: unauthorized\ndata: {}\n\n');
          drop(client);
        }
      }).catch(() => { /* a failed check must not end a healthy stream */ });
    }
  };

  const flush = () => {
    flushTimer = null;
    revision += 1;
    // A tab that made the only change in this window already refreshes itself, so it is not pinged about its own write.
    const onlyWriter = writers.size === 1 ? [...writers][0] : undefined;
    writers.clear();
    for (const client of [...clients]) {
      if (onlyWriter !== undefined && client.token === onlyWriter) continue;
      send(client, `event: changed\ndata: ${revision}\n\n`);
    }
  };

  return {
    /** Registers an open stream. Returns a function that closes it. */
    add({ res, userId, token, isValid }) {
      const client = { res, userId, token, isValid };
      const mine = [...clients].filter((c) => c.userId === userId);
      // Insertion order = age, so the oldest of someone's streams goes first when they have too many tabs open.
      if (mine.length >= maxPerUser) drop(mine[0]);
      clients.add(client);
      res.on('close', () => drop(client));
      if (!beat) { beat = setInterval(heartbeat, heartbeatMs); beat.unref?.(); }
      send(client, `retry: 5000\nevent: ready\ndata: ${revision}\n\n`);
      return () => drop(client);
    },

    /** Something was written. Bursts within `coalesceMs` become one message. `token` = the session that did it. */
    notifyChanged({ token } = {}) {
      writers.add(token);
      if (!flushTimer) flushTimer = setTimeout(flush, coalesceMs);
    },

    get size() { return clients.size; },

    /** Ends every stream (used on shutdown so the server can close promptly). */
    closeAll() {
      clearTimeout(flushTimer);
      flushTimer = null;
      for (const client of [...clients]) drop(client);
    },
  };
}

/**
 * The `GET /live` handler. `authenticate(req)` must throw (-> the normal 401 JSON error) when nobody valid is signed
 * in; it runs BEFORE any streaming starts. `isSessionValid(token)` is re-checked on every heartbeat.
 */
export function liveRoute({ hub, authenticate, isSessionValid }) {
  return async (req, res) => {
    await authenticate(req);
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // tell nginx-style proxies not to hold the stream back
    });
    res.flushHeaders();
    const token = req.sessionToken;
    hub.add({ res, userId: req.ctx.actorId, token, isValid: async () => Boolean(await isSessionValid(token)) });
  };
}
