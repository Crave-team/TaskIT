import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { api, ApiError, isRemoteApi, liveStreamUrl } from '../api';
import { startLivePoller } from '../api/livePoller.js';
import { startLiveStream } from '../api/liveStream.js';
import { DEFAULT_SYSTEM_SETTINGS } from '../api/config';
import { getSessionToken } from '../api/clientSession.js';

const ApiContext = createContext(null);

const EMPTY = {
  me: null,
  accounts: [],
  settings: DEFAULT_SYSTEM_SETTINGS,
  tasks: [],
  projects: [],
  reminders: [],
  notifications: [],
  groups: [],
  joinRequests: [],
  roleChanges: [],
  messages: [],
  activity: [],
  teamAnnouncements: [],
};

const ACTIVITY_PAGE = 200;

/** How often the visible tab quietly checks the server when the live stream is NOT connected. */
const LIVE_REFRESH_MS = 5000;
/** While the live stream is connected, a slow safety-net check still runs this often (the stream carries no data). */
const SAFETY_REFRESH_MS = 60_000;
/** Several changes in a burst become one refresh. */
const CHANGE_DEBOUNCE_MS = 120;

/**
 * The client side of the data layer: holds the latest `bootstrap` snapshot (a cache of what the
 * signed-in person may see) and re-fetches it after every change. All reads in the app come from
 * this snapshot; all writes go through `run` / `attempt`, which call `api.*` and then refresh.
 *
 * Other people's messages, notifications and task changes appear on their own:
 *   - the server pushes a tiny "something changed" message over a live stream (`startLiveStream`) and this tab
 *     re-fetches at once;
 *   - if that stream is not connected (older proxy, network drop), the tab falls back to re-fetching every few
 *     seconds while visible (`startLivePoller`); with the stream up the same poller is only a slow safety net.
 * Those refreshes are silent: they never show an error, and they only replace the snapshot when something actually
 * changed, so open windows, typed text and scroll positions are left alone.
 *
 * Because every `api` call is async and may be rejected by the server's permission checks, the
 * provider also shows a small dismissible banner when one is refused, so a rejected action is never
 * silent.
 */
export function ApiProvider({ children }) {
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [notice, setNotice] = useState(null);
  // False until the FIRST bootstrap has finished, i.e. until we know whether someone is already signed in.
  const [ready, setReady] = useState(false);
  // Set when the first load kept failing while a session token is held: the person is probably still signed in, we just
  // could not reach the server, so the app offers "Try again" instead of treating them as signed out.
  const [loadError, setLoadError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [activityLimit, setActivityLimit] = useState(ACTIVITY_PAGE);
  const seq = useRef(0);
  const limitRef = useRef(activityLimit);
  // The last snapshot a background refresh applied, as text, so an unchanged answer doesn't re-render the whole app.
  const lastLiveJson = useRef(null);
  const signedInRef = useRef(false);
  const signedInId = snapshot.me?.id ?? null;
  useEffect(() => { signedInRef.current = Boolean(signedInId); }, [signedInId]);
  // Live state shared by the stream and the poller: is the stream up, did a change arrive while the tab was hidden,
  // and when did data last arrive.
  const live = useRef({ connected: false, dirty: false, last: 0 });
  useEffect(() => { limitRef.current = activityLimit; }, [activityLimit]);

  const refresh = useCallback(async ({ background = false } = {}) => {
    const n = ++seq.current;
    const snap = await api.bootstrap({ activityLimit: limitRef.current });
    live.current.last = Date.now();
    // Ignore a response that was overtaken by a newer request. "Ready" (we know whether someone is signed in) is only
    // declared by the answer that is actually APPLIED: in development React starts this request twice on purpose, and
    // letting the first, discarded one declare readiness showed the log-in page for a moment on every refresh.
    if (n === seq.current) {
      if (background) {
        const json = JSON.stringify(snap);
        if (json === lastLiveJson.current) return snap;
        lastLiveJson.current = json;
      } else {
        lastLiveJson.current = null;
      }
      setSnapshot(snap.me ? { ...EMPTY, ...snap } : EMPTY);
      setReady(true);
    }
    return snap;
  }, []);

  // Live updates: only against a real server, only while someone is signed in.
  // 1) The push stream. A change while the tab is hidden is remembered and fetched when the person comes back.
  useEffect(() => {
    if (!isRemoteApi || !liveStreamUrl || !signedInId) return undefined;
    const state = live.current;
    let debounce = null;
    const catchUp = () => { refresh({ background: true }).catch(() => {}); };
    const stop = startLiveStream({
      url: liveStreamUrl,
      getToken: getSessionToken,
      onChange: () => {
        if (document.visibilityState === 'hidden') { state.dirty = true; return; }
        clearTimeout(debounce);
        debounce = setTimeout(catchUp, CHANGE_DEBOUNCE_MS);
      },
      onStatus: (connected) => {
        state.connected = connected;
        if (connected) catchUp(); // pick up anything missed while the stream was down
      },
    });
    return () => { clearTimeout(debounce); stop(); state.connected = false; };
  }, [refresh, signedInId]);

  // 2) The timer: the every-few-seconds fallback, which also wakes on returning to the tab.
  useEffect(() => {
    if (!isRemoteApi) return undefined;
    return startLivePoller({
      intervalMs: LIVE_REFRESH_MS,
      tick: async () => {
        if (!signedInRef.current) return;
        const state = live.current;
        const stale = Date.now() - state.last > SAFETY_REFRESH_MS;
        if (!state.connected || state.dirty || stale) {
          state.dirty = false;
          await refresh({ background: true });
        }
      },
    });
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // A failure on the very first load (slow database, a hiccup) must not look like "signed out" while a session
      // token is held: try again a couple of times before giving up.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await refresh();
          if (!cancelled) setLoadError(null);
          return;
        } catch (e) {
          if (!(e instanceof ApiError)) throw e;
          if (cancelled) return;
          if (attempt === 2 || !getSessionToken()) {
            if (getSessionToken()) {
              setLoadError(e.message);
            } else {
              setNotice(e.message);
              setReady(true);
            }
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [refresh, activityLimit, loadAttempt]);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setLoadAttempt((n) => n + 1);
  }, []);

  /**
   * Runs a write, then refreshes. If the server refuses it, shows the reason in the banner and
   * resolves `undefined`. Use `quiet` for background writes that should never interrupt anyone.
   */
  const run = useCallback(async (fn, { quiet = false } = {}) => {
    try {
      const result = await fn(api);
      await refresh();
      return result;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (!quiet) setNotice(e.message);
      await refresh();
      return undefined;
    }
  }, [refresh]);

  /** Like `run`, but reports the outcome to the caller (forms show the message next to the field). */
  const attempt = useCallback(async (fn) => {
    try {
      const data = await fn(api);
      await refresh();
      return { success: true, data };
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      await refresh();
      return { success: false, error: e.message, field: e.field, code: e.code };
    }
  }, [refresh]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const loadMoreActivity = useCallback(() => setActivityLimit((l) => l + ACTIVITY_PAGE), []);

  const value = { snapshot, ready, loadError, retryLoad, refresh, run, attempt, activityLimit, loadMoreActivity, api, notify: setNotice };

  return (
    <ApiContext.Provider value={value}>
      {children}
      {notice && (
        <div role="alert" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] flex items-start gap-2.5 max-w-[92vw] sm:max-w-md rounded-xl border border-coral-500/40 bg-surface-card dark:bg-surface-dark shadow-lg px-4 py-3">
          <AlertCircle size={17} className="text-coral-500 shrink-0 mt-0.5" />
          <p className="text-fluid-sm text-ink-900 dark:text-white">{notice}</p>
          <button onClick={() => setNotice(null)} aria-label="Dismiss message" className="text-ink-500 hover:text-ink-900 dark:hover:text-white shrink-0">
            <X size={15} />
          </button>
        </div>
      )}
    </ApiContext.Provider>
  );
}

export function useApi() {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used within an ApiProvider');
  return ctx;
}
