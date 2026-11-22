/**
 * Browser side of live updates: reads the server's `GET /live` Server-Sent Events stream and calls `onChange`
 * whenever the server says something changed. `fetch` is used instead of `EventSource` because EventSource cannot
 * send the `Authorization` header this app signs requests with (and a token in the URL would end up in logs).
 */

/** Incremental parser for the text/event-stream format. `push(text)` may be called with any slicing of the stream. */
export function createSseParser(onEvent) {
  let buffer = '';
  let event = 'message';
  let data = [];

  const dispatch = () => {
    if (data.length) onEvent({ event, data: data.join('\n') });
    event = 'message';
    data = [];
  };

  return {
    push(text) {
      buffer += text;
      const lines = buffer.split(/\r\n|\n|\r/);
      buffer = lines.pop() ?? ''; // the last piece may be an unfinished line
      for (const line of lines) {
        if (line === '') dispatch();
        else if (line.startsWith(':')) continue; // comment / heartbeat
        else {
          const i = line.indexOf(':');
          const field = i === -1 ? line : line.slice(0, i);
          const value = i === -1 ? '' : line.slice(i + 1).replace(/^ /, '');
          if (field === 'event') event = value;
          else if (field === 'data') data.push(value);
        }
      }
    },
  };
}

const sleep = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

/**
 * Opens the stream and keeps it open, reconnecting with a growing pause. Returns a function that closes it.
 *
 * @param {{
 *   url: string,
 *   getToken: () => string | null | undefined,
 *   onChange: () => void,
 *   onStatus?: (connected: boolean) => void,
 *   fetchFn?: typeof fetch,
 *   retryMs?: number[],
 * }} options
 */
export function startLiveStream({ url, getToken, onChange, onStatus = () => {}, fetchFn = (...a) => fetch(...a), retryMs = [1000, 2000, 5000, 10000, 30000] }) {
  const controller = new AbortController();
  const { signal } = controller;
  let connected = false;
  const setConnected = (value) => {
    if (connected === value) return;
    connected = value;
    onStatus(value);
  };

  (async () => {
    let failures = 0;
    while (!signal.aborted) {
      const token = getToken();
      if (!token) return; // signed out: nothing to listen to
      let gaveUp = false;
      try {
        const res = await fetchFn(url, {
          headers: { Authorization: `Bearer ${token}`, 'X-Requested-With': 'taskit', Accept: 'text/event-stream' },
          credentials: 'omit',
          cache: 'no-store',
          signal,
        });
        // 401/403: the session is gone. The regular API calls handle signing out; just stop listening.
        if (res.status === 401 || res.status === 403) return;
        if (!res.ok || !res.body) throw new Error(`live stream answered ${res.status}`);

        const parser = createSseParser(({ event }) => {
          if (event === 'changed') onChange();
          else if (event === 'unauthorized') gaveUp = true;
        });
        const decoder = new TextDecoder();
        const reader = res.body.getReader();
        for (;;) {
          // eslint-disable-next-line no-await-in-loop
          const { done, value } = await reader.read();
          if (done) break;
          if (!connected) { failures = 0; setConnected(true); }
          parser.push(decoder.decode(value, { stream: true }));
          if (gaveUp) { reader.cancel().catch(() => {}); break; }
        }
      } catch {
        // network drop or abort: fall through to the pause below (an abort ends the loop)
      }
      setConnected(false);
      if (gaveUp) return;
      // eslint-disable-next-line no-await-in-loop
      await sleep(retryMs[Math.min(failures, retryMs.length - 1)], signal);
      failures += 1;
    }
  })();

  return () => {
    controller.abort();
    setConnected(false);
  };
}
