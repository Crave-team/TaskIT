import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Button from '../common/Button';
import { useGroups } from '../../context/GroupContext';
import { panelClass } from './shared';

/**
 * Admins define the team's roles here. Every member holds at most one, and every new task is made for a role.
 * A role can only be deleted once nobody holds it, so nobody is left without one by surprise.
 */
export default function RolesPanel({ group }) {
  const { addRole, removeRole } = useGroups();
  const [name, setName] = useState('');
  const roles = group.roles || [];
  const holders = (roleId) => Object.values(group.memberRoles || {}).filter((id) => id === roleId).length;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const added = await addRole(group.id, name);
    if (added) setName(''); // on a refusal the app already showed why, and the typed name stays
  };

  return (
    <section className={`${panelClass} p-4 space-y-3`} aria-label="Team roles">
      <div>
        <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white">Roles <span className="text-ink-500 font-normal">({roles.length})</span></p>
        <p className="text-fluid-xs text-ink-500">Members pick their role when they join; after that only an admin can change it, with the member's approval. Each new task is created for a role and goes to someone who holds it. A batch is shared evenly, and any leftover goes to randomly chosen people.</p>
      </div>

      {roles.length > 0 && (
        <ul className="divide-y divide-ink-500/10 dark:divide-white/10">
          {roles.map((r) => {
            const count = holders(r.id);
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="text-fluid-sm text-ink-900 dark:text-white truncate">{r.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-fluid-xs text-ink-500">{count} member{count === 1 ? '' : 's'}</span>
                  <button
                    type="button"
                    onClick={() => removeRole(group.id, r.id)}
                    disabled={count > 0}
                    aria-label={`Delete role ${r.name}`}
                    title={count > 0 ? 'Members still hold this role' : 'Delete role'}
                    className="p-1.5 rounded-lg text-ink-500 hover:text-coral-600 hover:bg-coral-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="New role, e.g. Frontend"
          aria-label="New role name"
          className="flex-1 min-w-0 h-10 rounded-lg border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-dark px-3 text-fluid-sm text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none"
        />
        <Button type="submit" size="sm" icon={<Plus size={13} />} disabled={!name.trim()}>Add role</Button>
      </form>
    </section>
  );
}
