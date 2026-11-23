import { db, settingsStore } from '../repo.js';
import { badRequest, notFound } from '../errors.js';
import { requireActor, notify } from '../core.js';

/**
 * The notification bell and the deadline reminders.
 *
 * Deadline notices (overdue / due today / due tomorrow) used to be created by the browser, guarded by
 * in-memory "already shown" sets that reset on every reload. They are now created HERE and are
 * idempotent: each carries a `dedupeKey` (`overdue:<task>:<dueDate>`, `today:<kind>:<id>:<date>`, `soon:<kind>:<id>:<date>`)
 * and is stored at most once per person, so it can never repeat on the next login. A notice that
 * should also pop up carries `popup.pending: true` until the person dismisses it.
 *
 * The DAILY DIGEST lives here too: once per day (the first time `syncDeadlines` runs for a new local date) each person
 * who has the "Daily digest" preference on gets ONE bell notice summing up what needs attention. See `digestMessage`.
 */

const addDaysISO = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** How many days ahead "due this week" reaches in the digest. */
const DIGEST_WEEK_DAYS = 7;
/** Digests older than this many days are removed from the bell so it does not fill up with one entry per day. */
const DIGEST_KEEP_DAYS = 7;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The text of a daily digest, or null when there is nothing worth saying (an empty digest every morning would just be
 * noise). `c` = { overdue, today, tomorrow, week, reminders } counts; zero parts are left out.
 */
export function digestMessage(c) {
  const parts = [
    c.overdue && `${c.overdue} overdue`,
    c.today && `${c.today} due today`,
    c.tomorrow && `${c.tomorrow} due tomorrow`,
    c.week && `${c.week} more due in the next ${DIGEST_WEEK_DAYS} days`,
    c.reminders && `${plural(c.reminders, 'reminder')} today`,
  ].filter(Boolean);
  return parts.length ? `Daily digest: ${parts.join(', ')}.` : null;
}

const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

async function ownNotification(ctx, id) {
  const actor = await requireActor(ctx);
  const n = await db.notifications.get(id);
  if (!n || n.recipientId !== actor.id) throw notFound('Notification not found.');
  return n;
}

export async function markNotificationRead(ctx, id) {
  await ownNotification(ctx, id);
  await db.notifications.update(id, { read: true });
}

export async function markAllNotificationsRead(ctx) {
  const actor = await requireActor(ctx);
  for (const n of await db.notifications.find({ recipientId: actor.id })) {
    if (!n.read) await db.notifications.update(n.id, { read: true });
  }
}

export async function clearNotifications(ctx) {
  const actor = await requireActor(ctx);
  await db.notifications.removeWhere({ recipientId: actor.id });
}

/** The person dismissed deadline pop-ups: they will not pop up again (the bell entries stay). */
export async function acknowledgePopups(ctx, ids) {
  const actor = await requireActor(ctx);
  if (!Array.isArray(ids)) throw badRequest('Invalid input.');
  for (const id of ids) {
    const n = await db.notifications.get(id);
    if (n && n.recipientId === actor.id && n.popup) await db.notifications.update(id, { popup: { ...n.popup, pending: false } });
  }
}

/**
 * Brings the caller's deadline notices up to date for `today` (their local YYYY-MM-DD).
 *  - overdue : their own open tasks past due
 *  - today   : their open tasks AND calendar reminders due TODAY (pops up on the due date)
 *  - soon    : their open tasks AND calendar reminders due tomorrow (the day-before heads-up)
 * Members get all three; site admins have no tasks, so only reminders (today + the day before). Honors the site-wide
 * "Deadline & overdue alerts" switch and the person's "Due-date reminders" preference (either one off silences both
 * the overdue and the due-tomorrow pop-ups). Notices
 * whose task was finished, moved or deleted stop popping up. While a switch is off the existing notices are
 * marked `popup.silenced`; when it is turned back on, every one that still applies pops up again immediately.
 */
export async function syncDeadlines(ctx, { today }) {
  const actor = await requireActor(ctx);
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw badRequest('Invalid date.');
  const { notifyDeadlines } = await settingsStore.get();
  // Both pop-ups need the site-wide switch AND the person's own "Due-date reminders" preference to be on.
  const remindersOn = notifyDeadlines && (actor.prefs?.dueReminders ?? true);
  const wantOverdue = remindersOn;
  const wantSoon = remindersOn;
  const tomorrow = addDaysISO(today, 1);
  const desired = new Map(); // dedupeKey -> notification fields

  let mine = [];
  if (actor.accountRole !== 'admin') {
    // Only my own work: personal tasks I own + team tasks assigned to me (two small queries, not a table scan).
    const personal = await db.tasks.find({ ownerId: actor.id, groupId: null });
    const assigned = (await db.tasks.find({ assigneeId: actor.id })).filter((t) => t.groupId);
    mine = [...personal, ...assigned].filter((t) => !['done', 'review'].includes(t.status) && t.dueDate);
    mine.forEach((t) => {
      const meta = { kind: 'task', itemId: t.id, title: t.title, date: t.dueDate, priority: t.priority, groupId: t.groupId, projectId: t.projectId };
      if (wantOverdue && t.dueDate < today) {
        desired.set(`overdue:${t.id}:${t.dueDate}`, { type: 'overdue', message: `"${t.title}" is overdue — it was due ${shortDate(t.dueDate)}.`, taskId: t.id, popup: meta });
      } else if (wantSoon && t.dueDate === today) {
        desired.set(`today:task:${t.id}:${t.dueDate}`, { type: 'deadline', message: `"${t.title}" is due today.`, taskId: t.id, popup: { ...meta, when: 'today' } });
      } else if (wantSoon && t.dueDate === tomorrow) {
        desired.set(`soon:task:${t.id}:${t.dueDate}`, { type: 'deadline', message: `"${t.title}" is due tomorrow.`, taskId: t.id, popup: { ...meta, when: 'tomorrow' } });
      }
    });
  }
  if (wantSoon) {
    // Calendar reminders pop up twice: the day before (heads-up) and again on the day itself.
    for (const [date, when, prefix, label] of [[today, 'today', 'today', 'today'], [tomorrow, 'tomorrow', 'soon', 'tomorrow']]) {
      (await db.reminders.find({ ownerId: actor.id, date })).forEach((r) => {
        desired.set(`${prefix}:reminder:${r.id}:${r.date}`, {
          type: 'deadline',
          message: `Reminder: "${r.title}" is ${label}${r.time ? ` at ${r.time}` : ''}.`,
          link: '/calendar',
          popup: { kind: 'reminder', itemId: r.id, title: r.title, date: r.date, time: r.time, note: r.note, when },
        });
      });
    }
  }

  let created = 0; // deadline notices only; the digest is reported separately
  let digestCreated = false;
  for (const [dedupeKey, fields] of desired) {
    if (await notify(actor.id, { ...fields, dedupeKey })) created += 1;
  }

  // Daily digest: one summary notice per person per day. Needs the person's own "Daily digest" preference and the
  // site-wide deadline-alerts switch (it is a summary of deadlines). The `digest:<date>` key makes it once-a-day.
  if (notifyDeadlines && (actor.prefs?.dailyDigest ?? true)) {
    const weekEnd = addDaysISO(today, DIGEST_WEEK_DAYS);
    const message = digestMessage({
      overdue: mine.filter((t) => t.dueDate < today).length,
      today: mine.filter((t) => t.dueDate === today).length,
      tomorrow: mine.filter((t) => t.dueDate === tomorrow).length,
      week: mine.filter((t) => t.dueDate > tomorrow && t.dueDate <= weekEnd).length,
      reminders: (await db.reminders.find({ ownerId: actor.id, date: today })).length,
    });
    if (message) digestCreated = Boolean(await notify(actor.id, { type: 'digest', message, link: actor.accountRole === 'admin' ? '/calendar' : '/tasks', dedupeKey: `digest:${today}` }));
  }
  // Old digests leave the bell after a week (they are summaries of days that are long gone).
  const digestCutoff = addDaysISO(today, -DIGEST_KEEP_DAYS);
  for (const n of await db.notifications.find({ recipientId: actor.id, type: 'digest' })) {
    if (n.dedupeKey && n.dedupeKey.slice('digest:'.length) < digestCutoff) await db.notifications.remove(n.id);
  }

  // Bring the pop-up state of existing deadline notices in line with the switches and the current tasks.
  for (const n of await db.notifications.find({ recipientId: actor.id })) {
    const isDeadline = n.dedupeKey && (n.dedupeKey.startsWith('overdue:') || n.dedupeKey.startsWith('soon:') || n.dedupeKey.startsWith('today:'));
    if (!isDeadline || !n.popup) continue;
    const setPopup = (changes) => db.notifications.update(n.id, { popup: { ...n.popup, ...changes } });
    if (!remindersOn) {
      // Switched off: nothing may pop up. Remember that the SWITCH silenced it (dismissed ones included), so
      // turning the switch back on can show it again. The notice itself stays in the bell.
      if (!n.popup.silenced) await setPopup({ pending: false, silenced: true });
    } else if (n.popup.silenced) {
      // Switched back on: a notice that is still valid (task still open and late / due tomorrow) pops up again at once.
      await setPopup({ pending: desired.has(n.dedupeKey), silenced: false });
    } else if (n.popup.pending && !desired.has(n.dedupeKey)) {
      // Finished, rescheduled or deleted: stop popping up.
      await setPopup({ pending: false });
    }
  }
  return { created, digestCreated };
}
