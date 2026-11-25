import { UserMinus, ShieldPlus, ShieldMinus, Check, X } from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import AboutTab from './AboutTab';
import { useGroups, isAdminOf } from '../../context/GroupContext';
import { useAuth } from '../../context/AuthContext';
import { Avatar, timeAgo, panelClass } from './shared';
import RolesPanel from './RolesPanel';

const iconBtn = 'p-1.5 rounded-lg text-ink-500 transition-colors';

/**
 * Roster of the team. Everyone can see who's in; group admins approve or decline
 * join requests, promote a member to admin, and remove members. Invite code and
 * team settings sit underneath.
 */
export default function MembersTab({ group, members, isAdmin, onGone }) {
  const { joinRequests, roleChanges, approveJoinRequest, declineJoinRequest, kickMember, promoteMember, demoteMember, proposeRoleChange, answerRoleChange, cancelRoleChange } = useGroups();
  const { accounts, currentUser } = useAuth();
  const isOwner = currentUser.id === group.ownerId;
  const requests = isAdmin ? joinRequests.filter((r) => r.groupId === group.id) : [];

  const roles = group.roles || [];
  const roleName = (id) => roles.find((r) => r.id === id)?.name || '';
  const roleOf = (userId) => (group.memberRoles || {})[userId] || '';
  const proposals = roleChanges.filter((c) => c.groupId === group.id);
  const forMe = proposals.filter((c) => c.accountId === currentUser.id);
  // Only an admin changes roles. For anyone else it is a request they have to accept; an admin's own applies at once.
  const pickRole = (m, roleId) => proposeRoleChange(group.id, m.id, roleId);

  // kickMember also hands the person's unfinished tasks back to Unassigned.
  const kick = (m) => kickMember(group.id, m.id);

  return (
    <div className="space-y-6">
      {forMe.length > 0 && (
        <section className={`${panelClass} p-4 space-y-3`} aria-label="Role requests for you">
          {forMe.map((c) => (
            <div key={c.id} className="flex items-center gap-3 flex-wrap">
              <p className="min-w-0 flex-1 text-fluid-sm text-ink-900 dark:text-white">
                An admin asked you to take the role <span className="font-semibold">{roleName(c.roleId)}</span>.
              </p>
              <Button size="sm" icon={<Check size={13} />} onClick={() => answerRoleChange(c.id, true)}>Accept</Button>
              <Button size="sm" variant="secondary" icon={<X size={13} />} onClick={() => answerRoleChange(c.id, false)}>Decline</Button>
            </div>
          ))}
        </section>
      )}

      {requests.length > 0 && (
        <section className={`${panelClass} p-4 space-y-3`} aria-label="Join requests">
          <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white">
            Join requests <span className="text-ink-500 font-normal">({requests.length})</span>
          </p>
          <ul className="divide-y divide-ink-500/10 dark:divide-white/10">
            {requests.map((r) => {
              const person = accounts.find((a) => a.id === r.accountId);
              if (!person) return null;
              return (
                <li key={r.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <Avatar id={person.id} name={person.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-fluid-sm font-medium text-ink-900 dark:text-white truncate">{person.name}</p>
                    <p className="text-fluid-xs text-ink-500 truncate">{[person.title, roleName(r.roleId)].filter(Boolean).join(' · ')} · asked {timeAgo(r.createdAt)}</p>
                  </div>
                  <Button size="sm" icon={<Check size={13} />} onClick={() => approveJoinRequest(r.id)}>Approve</Button>
                  <Button size="sm" variant="secondary" icon={<X size={13} />} onClick={() => declineJoinRequest(r.id)}>Decline</Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {isAdmin && <RolesPanel group={group} />}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white">
            Members <span className="text-ink-500 font-normal">({members.length})</span>
          </p>
        </div>

        <ul className={`${panelClass} divide-y divide-ink-500/10 dark:divide-white/10`}>
          {members.map((m) => {
            const memberIsOwner = m.id === group.ownerId;
            const memberIsAdmin = isAdminOf(group, m.id);
            const canKick = isAdmin && !memberIsOwner && m.id !== currentUser.id && (!memberIsAdmin || isOwner);
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar id={m.id} name={m.name} />
                  <div className="min-w-0">
                    <p className="text-fluid-sm font-medium text-ink-900 dark:text-white truncate">
                      {m.name}{m.id === currentUser.id && <span className="text-ink-500 font-normal"> (you)</span>}
                    </p>
                    <p className="text-fluid-xs text-ink-500 truncate">{[m.title, roleName(roleOf(m.id)) || (roles.length > 0 ? 'No role yet' : '')].filter(Boolean).join(' · ')}</p>
                    {roles.length > 0 && isAdmin && (
                      <select
                        value=""
                        onChange={(e) => pickRole(m, e.target.value)}
                        aria-label={m.id === currentUser.id ? 'Set your role' : `Ask ${m.name} to change role`}
                        className="mt-1 max-w-full rounded-lg border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-dark px-2 py-1 text-fluid-xs text-ink-900 dark:text-white focus:outline-none"
                      >
                        <option value="" disabled>{m.id === currentUser.id ? 'Set your role…' : roleOf(m.id) ? 'Ask to change role…' : 'Ask to give a role…'}</option>
                        {roles.filter((r) => r.id !== roleOf(m.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    )}
                    {isAdmin && proposals.filter((c) => c.accountId === m.id).map((c) => (
                      <p key={c.id} className="mt-1 text-fluid-xs text-amber-700 dark:text-amber-300">
                        Waiting for {m.name} to accept “{roleName(c.roleId)}”.{' '}
                        <button type="button" onClick={() => cancelRoleChange(c.id)} className="underline">Cancel</button>
                      </p>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {memberIsOwner ? <Badge tone="amber">Owner</Badge> : memberIsAdmin ? <Badge tone="brand">Admin</Badge> : <Badge>Member</Badge>}
                  {isAdmin && !memberIsAdmin && (
                    <button onClick={() => promoteMember(group.id, m.id)} aria-label={`Promote ${m.name} to admin`} title="Promote to admin" className={`${iconBtn} hover:text-brand-700 hover:bg-brand-500/10`}>
                      <ShieldPlus size={16} />
                    </button>
                  )}
                  {isOwner && memberIsAdmin && !memberIsOwner && (
                    <button onClick={() => demoteMember(group.id, m.id)} aria-label={`Remove admin rights from ${m.name}`} title="Remove admin rights" className={`${iconBtn} hover:text-amber-600 hover:bg-amber-500/10`}>
                      <ShieldMinus size={16} />
                    </button>
                  )}
                  {canKick && (
                    <button onClick={() => kick(m)} aria-label={`Remove ${m.name}`} title={`Remove ${m.name}`} className={`${iconBtn} hover:text-coral-600 hover:bg-coral-500/10`}>
                      <UserMinus size={16} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <AboutTab key={group.id} group={group} isOwner={isOwner} onGone={onGone} />
    </div>
  );
}
