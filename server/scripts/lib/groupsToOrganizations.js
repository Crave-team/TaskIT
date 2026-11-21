import { createHash } from 'node:crypto';

/**
 * Pure planning functions for the groups -> organizations migration (no database access, so they are unit-tested).
 *
 * Ids created here are DERIVED from the group id (not random), so running the migration again after a crash creates
 * the same ids and the "insert only if missing" step simply finds them already there.
 */
export const derivedId = (...parts) => createHash('sha1').update(parts.join(':')).digest('hex').slice(0, 24);
export const unitIdFor = (groupId) => derivedId('unit', groupId);
export const memberIdFor = (orgId, userId) => derivedId('member', orgId, userId);

const unique = (list) => [...new Set(list.filter((v) => typeof v === 'string' && v))];

/**
 * Turns one old group document into the new documents:
 *  - the organization keeps the group's _id, so every existing groupId value is already a valid orgId;
 *  - ONE top-level unit named after the group holds everyone, so existing work keeps a home;
 *  - the group owner becomes the Owner; the first other admin leads the unit (the owner leads it only when there is
 *    no other admin); further admins become Assistants; everyone else is a Member.
 */
export function planGroup(group) {
  const orgId = group._id;
  const ownerId = group.ownerId;
  const admins = unique([ownerId, ...(group.adminIds || [])]);
  const otherAdmins = admins.filter((id) => id !== ownerId);
  const leaderId = otherAdmins[0] ?? ownerId;
  const assistantIds = new Set(otherAdmins.slice(1));
  const unitId = unitIdFor(orgId);
  const people = unique([ownerId, ...admins, ...(group.memberIds || [])]);

  const organization = {
    _id: orgId,
    name: group.name,
    description: group.description ?? '',
    visibility: group.visibility === 'private' ? 'private' : 'public',
    ownerId,
    inviteCode: group.inviteCode,
    legacy: { adminIds: group.adminIds || [], roles: group.roles || [], memberRoles: group.memberRoles || {} },
    createdAt: group.createdAt,
  };

  const unit = {
    _id: unitId,
    orgId,
    parentId: null,
    name: group.name,
    nameKey: String(group.name || '').trim().toLowerCase(),
    path: [],
    depth: 0,
    createdById: ownerId,
    createdAt: group.createdAt,
  };

  const members = people.map((userId) => {
    const isOwner = userId === ownerId;
    let unitRole = 'member';
    if (userId === leaderId) unitRole = 'leader';
    else if (assistantIds.has(userId)) unitRole = 'assistant';
    // The Owner works across the whole organization; they sit in the unit only when they lead it.
    const inUnit = !isOwner || unitRole === 'leader';
    return {
      _id: memberIdFor(orgId, userId),
      orgId,
      userId,
      role: isOwner ? 'owner' : 'member',
      unitId: inUnit ? unitId : null,
      unitRole: inUnit ? unitRole : null,
      joinedAt: group.createdAt,
    };
  });

  return { organization, unit, members, unitId, leaderId };
}
