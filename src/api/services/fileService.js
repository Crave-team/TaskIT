import { db } from '../repo.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { nowISO, requireActor, releaseFile, isGroupAdmin, isGroupMember } from '../core.js';
import { storage } from '../storage.js';
import { newId } from '../ids.js';
import { config } from '../config.js';

/**
 * Uploads. A file is uploaded FIRST (getting an id and a URL), and tasks, turn-ins, chat
 * messages and avatars then reference it by `fileId`. In the Node server `file` is the parsed
 * multipart upload (`{ name, size, type, buffer }`) and `storage` writes it to disk / S3 / GridFS.
 */

/** Keeps only a safe base name: no folders, no control characters, bounded length. */
export function safeFileName(name) {
  // Stripping control characters is the point of this pattern.
  // oxlint-disable-next-line no-control-regex
  const base = String(name).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim();
  return (base || 'file').slice(0, 150);
}

/** The browser-reported type is untrusted: accept only a well-formed `type/subtype`, else a generic one. */
export function safeMime(type) {
  return typeof type === 'string' && /^[a-z0-9][\w.+-]*\/[a-z0-9][\w.+-]*$/i.test(type) ? type.toLowerCase().slice(0, 100) : 'application/octet-stream';
}

/** @param {{ name: string, size: number, type?: string }} file  a browser File or the server's parsed upload */
export async function uploadFile(ctx, file) {
  const actor = await requireActor(ctx);
  if (!file || typeof file.name !== 'string' || !file.name.trim()) throw badRequest('No file was provided.');
  const size = Number(file.size) || 0;
  if (size > config.MAX_FILE_BYTES) throw badRequest(`That file is larger than ${Math.round(config.MAX_FILE_BYTES / 1048576)} MB.`);
  const id = newId();
  const url = await storage.put(file, id);
  return db.files.insert({
    id, ownerId: actor.id, name: safeFileName(file.name), size, mime: safeMime(file.type), url, createdAt: nowISO(),
  });
}

/** Discard an upload that was never attached (for example a cancelled draft). */
export async function deleteFile(ctx, fileId) {
  const actor = await requireActor(ctx);
  const file = await db.files.get(fileId);
  if (!file) throw notFound('File not found.');
  if (file.ownerId !== actor.id && actor.accountRole !== 'admin') throw forbidden();
  await releaseFile(fileId);
}

/**
 * May this person read this file? Yes if they uploaded it, are the site admin, or can see the thing it
 * is attached to: a task's attachment / turn-in (the owner, the assignee, the team's admins), a team chat
 * photo (team members), or the avatar of someone they share a team with.
 */
async function canRead(actor, file) {
  if (file.ownerId === actor.id || actor.accountRole === 'admin') return true;
  const groupOf = async (id) => (id ? db.groups.get(id) : null);

  const tasks = [
    ...(await db.tasks.find({ 'attachments.fileId': file.id })),
    ...(await db.tasks.find({ 'turnIn.files.fileId': file.id })),
    ...(await db.tasks.find({ 'turnInDraft.files.fileId': file.id })),
    ...(await db.tasks.find({ 'previousTurnIns.files.fileId': file.id })),
  ];
  for (const t of tasks) {
    if (!t.groupId) { if (t.ownerId === actor.id) return true; continue; }
    const g = await groupOf(t.groupId);
    if (isGroupMember(g, actor.id) && (isGroupAdmin(g, actor.id) || t.assigneeId === actor.id)) return true;
  }
  const message = await db.messages.findOne({ 'image.fileId': file.id });
  if (message && isGroupMember(await groupOf(message.groupId), actor.id)) return true;

  const avatarOwner = await db.users.findOne({ avatarFileId: file.id });
  if (avatarOwner) {
    const shared = await db.groups.find({ memberIds: actor.id });
    if (shared.some((g) => isGroupMember(g, avatarOwner.id))) return true;
  }
  return false;
}

/** The file record if the caller may read it. Unreadable and missing look the same (404), so ids cannot be probed. */
export async function getFileForDownload(ctx, fileId) {
  const actor = await requireActor(ctx);
  const file = await db.files.get(fileId);
  if (!file || !(await canRead(actor, file))) throw notFound('File not found.');
  return file;
}
