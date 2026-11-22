/**
 * Keeps the app current without the person doing anything: calls `tick` every `intervalMs`, but only while the
 * tab is visible, straight away when the person comes back to the tab (or the network returns), never two at once,
 * and with a growing pause after failures so an unreachable server isn't hammered. Returns a function that stops it.
 *
 * It has no idea what `tick` does; the app passes a quiet refresh of its data. `doc` / `win` are injectable so the
 * timing rules can be tested in plain Node.
 *
 * @param {{ tick: () => Promise<unknown>, intervalMs: number, maxBackoffMs?: number, doc?: Document, win?: Window }} options
 */
export function startLivePoller({ tick, intervalMs, maxBackoffMs = 60_000, doc = document, win = window }) {
  let timer = null;
  let failures = 0;
  let running = false;
  let stopped = false;

  const visible = () => doc.visibilityState !== 'hidden';
  const nextDelay = () => Math.min(intervalMs * 2 ** failures, maxBackoffMs);

  const schedule = () => {
    clearTimeout(timer);
    timer = null;
    if (stopped || !visible()) return;
    timer = setTimeout(run, nextDelay());
  };

  async function run() {
    if (stopped) return;
    if (running || !visible()) {
      schedule();
      return;
    }
    running = true;
    try {
      await tick();
      failures = 0;
    } catch {
      // A failed background refresh is never shown to the person; it just waits longer before the next try.
      failures += 1;
    } finally {
      running = false;
      schedule();
    }
  }

  // Coming back to the tab, or back online, refreshes right away instead of waiting out the interval.
  const wake = () => {
    clearTimeout(timer);
    timer = null;
    if (visible() && !stopped) {
      failures = 0;
      run();
    }
  };

  doc.addEventListener('visibilitychange', wake);
  win.addEventListener('focus', wake);
  win.addEventListener('online', wake);
  schedule();

  return () => {
    stopped = true;
    clearTimeout(timer);
    doc.removeEventListener('visibilitychange', wake);
    win.removeEventListener('focus', wake);
    win.removeEventListener('online', wake);
  };
}
