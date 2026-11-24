import { useEffect, useState } from 'react';
import { usePersistedState } from '../../../hooks/usePersistedState';
import { Play, Square, Clock3, Plus } from 'lucide-react';
import ProgressBar from '../../common/ProgressBar';

/** Formats a minute count as "1h 45m" / "35m". */
function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatWhen(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Time tracking tab: start/stop timer for the current session plus a
 * manual-entry fallback, a running total, and an estimated-vs-actual
 * comparison — the PPT's Time Tracking + Progress Tracking modules.
 *
 * Works on either a saved task or a not-yet-created draft (the parent passes an `api`).
 *
 * @param {{ api: ReturnType<typeof import('../useTaskEditor').default>['api'] }} props
 */
export default function TimeTab({ api }) {
  const { addTimeEntry, setEstimate, startTimer, stopTimer } = api;
  const [manualMinutes, setManualMinutes] = usePersistedState('taskEditor.manualMinutes', '');
  const [manualNote, setManualNote] = usePersistedState('taskEditor.manualNote', '');
  const startedAt = api.timerStartedAt;
  const running = startedAt !== null;

  // The timer itself lives outside this tab (in TaskContext for a saved task, in the
  // dialog's draft for a new one) so it survives tab switches. This just re-renders
  // once a second to show how long it has been running.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  const elapsedSec = running ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;

  const entries = api.timeEntries;
  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
  const estimated = api.estimatedMinutes;

  const handleStop = () => stopTimer();

  const handleManualAdd = (e) => {
    e.preventDefault();
    const minutes = parseInt(manualMinutes, 10);
    if (!minutes || minutes <= 0) return;
    addTimeEntry(minutes, manualNote.trim() || 'Manual entry');
    setManualMinutes('');
    setManualNote('');
  };

  const hours = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
  const timerDisplay = `${hours}:${String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0')}:${String(elapsedSec % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-5">
      <div
        className={`flex items-center justify-between rounded-xl px-4 py-3 border transition-colors ${
          running ? 'bg-brand-500/10 border-brand-600/30' : 'bg-ink-500/5 dark:bg-white/5 border-transparent'
        }`}
      >
        <div>
          <p className="flex items-center gap-1.5 text-fluid-xs text-ink-500">
            {running && (
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-60 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-brand-600" />
              </span>
            )}
            {running ? 'Tracking your progress' : 'Timer not running'}
          </p>
          <p className="font-display font-bold text-fluid-xl text-ink-900 dark:text-white tabular-nums">
            {timerDisplay}
          </p>
        </div>
        {running ? (
          <button
            type="button"
            onClick={handleStop}
            className="flex items-center gap-1.5 text-fluid-sm font-medium bg-coral-500 text-white rounded-lg px-3.5 py-2 hover:bg-coral-600 transition-colors"
          >
            <Square size={14} /> Stop &amp; log
          </button>
        ) : (
          <button
            type="button"
            onClick={() => startTimer()}
            className="flex items-center gap-1.5 text-fluid-sm font-medium bg-brand-600 text-white rounded-lg px-3.5 py-2 hover:bg-brand-700 transition-colors"
          >
            <Play size={14} /> {entries.length > 0 ? 'Resume' : 'Start'}
          </button>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-fluid-xs font-medium text-ink-700 dark:text-ink-300">
            {formatMinutes(totalMinutes)} logged{estimated > 0 && ` of ${formatMinutes(estimated)} estimated`}
          </span>
        </div>
        {estimated > 0 && (
          <ProgressBar
            value={Math.round((totalMinutes / estimated) * 100)}
            tone={totalMinutes > estimated ? 'coral' : 'brand'}
          />
        )}
        <div className="flex items-center gap-2 mt-2">
          <label className="text-fluid-xs text-ink-500 shrink-0" htmlFor="estimate-minutes">Estimate (min)</label>
          <input
            id="estimate-minutes"
            type="number"
            min="0"
            value={estimated || ''}
            onChange={(e) => setEstimate(parseInt(e.target.value, 10) || 0)}
            className="w-24 text-fluid-sm bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-ink-900 dark:text-white focus:outline-none"
          />
        </div>
      </div>

      {entries.length > 0 && (
        <ul className="space-y-1.5">
          {entries.slice().reverse().map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-fluid-sm px-1">
              <div className="flex items-center gap-2 min-w-0">
                <Clock3 size={13} className="text-ink-500 shrink-0" />
                <span className="text-ink-700 dark:text-ink-300 truncate">{e.note}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-ink-500 text-fluid-xs">{formatWhen(e.loggedAt)}</span>
                <span className="font-medium text-ink-900 dark:text-white">{formatMinutes(e.minutes)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleManualAdd} className="flex flex-wrap gap-2 pt-1 border-t border-ink-500/10 dark:border-white/10">
        <input
          type="number"
          min="1"
          value={manualMinutes}
          onChange={(e) => setManualMinutes(e.target.value)}
          placeholder="Minutes"
          className="w-24 text-fluid-sm bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg px-3 py-2 mt-2 text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none"
        />
        <input
          value={manualNote}
          onChange={(e) => setManualNote(e.target.value)}
          placeholder="What did you work on? (optional)"
          className="flex-1 min-w-[140px] text-fluid-sm bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg px-3 py-2 mt-2 text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none"
        />
        <button
          type="submit"
          className="mt-2 shrink-0 flex items-center gap-1 text-fluid-xs font-medium bg-ink-500/10 dark:bg-white/10 text-ink-700 dark:text-ink-300 rounded-lg px-3 py-2 hover:bg-ink-500/15 dark:hover:bg-white/15 transition-colors"
        >
          <Plus size={14} /> Log time
        </button>
      </form>
    </div>
  );
}
