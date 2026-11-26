import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFileUrl } from '../../hooks/useFileUrl';

const AVATAR_COLORS = ['bg-brand-600', 'bg-coral-500', 'bg-amber-500', 'bg-sage-500'];

export function initials(name = '') {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function colorFor(id = '') {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * Round avatar for a person: their uploaded photo when they have one, otherwise initials coloured by a stable hash of
 * `id`. The photo comes from the account list the server sends (a teammate's public details include `avatarUrl`), so
 * a changed photo shows up for everyone on the team without each caller passing it in.
 */
export function Avatar({ id, name, size = 'md' }) {
  const { accounts } = useAuth();
  // Photos served by the API load with the session header; the initials show until the photo arrives.
  const photo = useFileUrl(accounts.find((a) => a.id === id)?.avatarUrl);
  const dims = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-fluid-xs';
  if (photo) {
    return <img src={photo} alt={name} className={`${dims} rounded-full object-cover shrink-0`} />;
  }
  return (
    <span className={`${dims} rounded-full ${colorFor(id)} text-white flex items-center justify-center font-semibold shrink-0`}>
      {initials(name)}
    </span>
  );
}

/** Rounded-square team icon. */
export function TeamIcon({ id, name, size = 'md' }) {
  const dims = size === 'sm' ? 'w-7 h-7 text-[10px] rounded-lg' : 'w-11 h-11 text-fluid-sm rounded-xl';
  return (
    <span className={`${dims} ${colorFor(id)} text-white flex items-center justify-center font-semibold shrink-0`}>
      {initials(name)}
    </span>
  );
}

/** "Just now", "5m ago", "3h ago", or a short date. */
export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const panelClass =
  'bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 shadow-soft rounded-2xl';

/** "42s", "12m 05s", "2h 05m" or "1d 3h 05m" for a length of time in milliseconds. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const two = (n) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${h}h ${two(m)}m`;
  if (h > 0) return `${h}h ${two(m)}m`;
  if (m > 0) return `${m}m ${two(sec)}s`;
  return `${sec}s`;
}

/**
 * The team timer for one task. It starts when the task is assigned and keeps counting while the task is
 * To Do / In Progress; once it is turned in (To Review, then Done) it stops and shows how long the work took.
 * Unassigned tasks have no timer.
 */
export function TaskTimer({ task, className = '' }) {
  const finished = task.status === 'review' || task.status === 'done';
  const startIso = task.assignedAt || (task.assigneeId ? task.createdAt : null);
  const running = !finished && Boolean(startIso);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (finished) {
    const ms = task.turnIn?.durationMs;
    if (ms == null) return null;
    return (
      <span className={`inline-flex items-center gap-1 text-fluid-xs font-medium text-ink-700 dark:text-ink-300 ${className}`} title="Time from assignment to turn-in">
        <Timer size={12} aria-hidden="true" /> Took {formatDuration(ms)}
      </span>
    );
  }
  if (!running) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-fluid-xs font-medium text-brand-700 dark:text-brand-300 tabular-nums ${className}`} title="Running since this task was assigned">
      <Timer size={12} aria-hidden="true" /> {formatDuration(now - Date.parse(startIso))}
    </span>
  );
}
