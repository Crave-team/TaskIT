/**
 * "Populate" step: documents store people as IDs, and these helpers add the display names the
 * UI shows (the equivalent of Mongoose `.populate()` / an API response serializer). Both the
 * id and the name are returned, so the UI compares IDs and merely *displays* names.
 */

/** Fields anyone who shares a team with you may see. */
export const publicUser = (u) => ({
  id: u.id, name: u.name, title: u.title, avatarUrl: u.avatarUrl ?? null, avatarColor: u.avatarColor || 'brand',
});

/**
 * Full account record minus credentials (for the person themself and for site admins). The password hash and the
 * Google subject id never leave the server; `hasPassword` / `googleLinked` tell the UI which sign-in methods exist.
 */
export function privateUser(u) {
  // oxlint-disable-next-line no-unused-vars
  const { passwordHash, googleId, ...rest } = u;
  return { ...rest, hasPassword: Boolean(passwordHash), googleLinked: Boolean(googleId) };
}

/** Returns `nameOf(id, snapshot)`: the person's current name, else the stored snapshot. */
export function makeNamer(users) {
  const byId = new Map(users.map((u) => [u.id, u.name]));
  return (id, snapshot = null) => (id && byId.get(id)) || snapshot || 'Former member';
}

const withBy = (entry, nameOf, idKey = 'byId', nameKey = 'byName', outKey = 'by') =>
  (entry ? { ...entry, [outKey]: nameOf(entry[idKey], entry[nameKey]) } : entry);

export function populateTask(task, nameOf) {
  const turnIn = (t) => (t ? { ...withBy(t, nameOf), approvedBy: t.approvedById ? nameOf(t.approvedById, t.approvedByName) : undefined } : t);
  return {
    ...task,
    assignee: task.assigneeId ? nameOf(task.assigneeId) : 'Unassigned',
    comments: (task.comments || []).map((c) => withBy(c, nameOf, 'authorId', 'authorName', 'author')),
    attachments: (task.attachments || []).map((a) => withBy(a, nameOf, 'uploadedById', 'uploadedByName', 'uploadedBy')),
    history: (task.history || []).map((h) => withBy(h, nameOf)),
    turnIn: turnIn(task.turnIn),
    turnInDraft: withBy(task.turnInDraft, nameOf),
    previousTurnIns: (task.previousTurnIns || []).map(turnIn),
    returned: withBy(task.returned, nameOf),
  };
}

export function populateActivity(entry, nameOf) {
  return { ...entry, actor: nameOf(entry.actorId, entry.actorName) };
}
