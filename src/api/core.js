import { db } from './repo.js';
import { forbidden, unauthorized } from './errors.js';
import { storage } from './storage.js';

/** Safe paging options from untrusted input: a bounded integer limit and a well-formed id cursor. */
export function cleanPage({ limit, before } = {}, max = 500, fallback = 100) {
  const n = Number.parseInt(limit, 10);
  return {
    limit: Number.isFinite(n) ? Math.min(Math.max(n, 1), max) : fallback,
    before: typeof before === 'string' && /^[0-9a-f]{24}$/.test(before) ? before : null,
  };
}

/** ISO timestamp "now" (kept in one place so tests can stub it). */
export const nowISO = () => new Date().toISOString();

/**
 * Resolves the caller from the request context. `ctx.actorId` is set by the transport
 * (the session in the browser demo, the JWT/session middleware in Express) — NEVER by the
 * request body — so a client cannot act as someone else.
 */
export async function requireActor(ctx) {
  const user = ctx?.actorId ? await db.users.get(ctx.actorId) : null;
  if (!user) throw unauthorized('Please log in.');
  if (user.status === 'suspended') throw forbidden('This account has been banned by an admin.');
  return user;
}

export async function requireSiteAdmin(ctx) {
  const user = await requireActor(ctx);
  if (user.accountRole !== 'admin') throw forbidden('Only a site administrator can do that.');
  return user;
}

export const isGroupAdmin = (group, userId) =>
  Boolean(group) && (group.ownerId === userId || (group.adminIds || []).includes(userId));
export const isGroupMember = (group, userId) => Boolean(group) && group.memberIds.includes(userId);
export const adminIdsOf = (group) => [...new Set([group.ownerId, ...(group.adminIds || [])])];

/** Appends an entry to the audit trail. Names are snapshotted so deleted users stay readable. */
export async function logActivity(actor, action, target, { groupId = null, scope = null, kind = 'action' } = {}) {
  await db.activity.insert({
    kind,
    scope: scope || (groupId ? 'team' : 'workspace'),
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? 'System',
    action,
    target,
    groupId,
    createdAt: nowISO(),
  });
}

/**
 * Adds a notification to someone's bell. Respects the recipient's preferences (mentions can
 * be switched off). `dedupeKey` makes it idempotent: the same key is never stored twice for a
 * recipient. `popup` marks deadline notices that should also show as a pop-up until dismissed.
 */
export async function notify(recipientId, { type, message, taskId = null, link = null, dedupeKey = null, popup = null }) {
  const recipient = recipientId ? await db.users.get(recipientId) : null;
  if (!recipient) return null;
  if (type === 'mention' && recipient.prefs?.mentions === false) return null;
  if (dedupeKey && await db.notifications.findOne({ recipientId, dedupeKey })) return null;
  try {
    return await db.notifications.insert({
      recipientId,
      type,
      message,
      taskId,
      link,
      dedupeKey,
      // Present only when there is a key: a unique sparse index on it makes "one notice per person per key" a database guarantee.
      ...(dedupeKey ? { dedupeId: `${recipientId}:${dedupeKey}` } : {}),
      popup: popup ? { ...popup, pending: true } : null,
      read: false,
      createdAt: nowISO(),
    });
  } catch (e) {
    // The unique {recipientId, dedupeKey} index rejected a concurrent duplicate: that is the idempotency guarantee.
    if (isDuplicateKey(e)) return null;
    throw e;
  }
}

/** True for MongoDB's "E11000 duplicate key" error (what a unique index raises). */
export const isDuplicateKey = (e) => e?.code === 11000;

/** Frees one stored file (record + bytes). */
export async function releaseFile(fileId) {
  if (!fileId) return;
  const record = await db.files.remove(fileId);
  if (record) await storage.remove(record);
}

/** Frees every file referenced by a list of attachment-like objects. */
export async function releaseFiles(items = []) {
  for (const f of items) await releaseFile(f?.fileId);
}

/** Frees all files a task owns (attachments + turn-in submissions, including drafts and past ones). */
export async function releaseTaskFiles(task) {
  await releaseFiles(task.attachments);
  await releaseFiles(task.turnIn?.files);
  await releaseFiles(task.turnInDraft?.files);
  for (const t of task.previousTurnIns || []) await releaseFiles(t?.files);
}
