import { useEffect, useRef, useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useBusy } from '../../hooks/useBusy';
import { Globe2, Lock } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';

const inputClass =
  'w-full rounded-lg border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-dark px-3 py-2 text-fluid-sm text-ink-900 dark:text-white placeholder:text-ink-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

/**
 * Creates a new group. The creator automatically becomes that group's
 * admin (leader/manager) — a role scoped entirely to this one group, and
 * unrelated to the site's single admin/developer account.
 *
 * @param {{ open: boolean, onClose: () => void, onCreate: (data: {name:string, description:string, visibility:string}) => void }} props
 */
export default function CreateGroupModal({ open, onClose, onCreate }) {
  const [guard, busy] = useBusy();
  // What was typed survives a page refresh (the window comes back as it was left).
  const [name, setName, restored] = usePersistedState('createTeam.name', '');
  const [description, setDescription] = usePersistedState('createTeam.description', '');
  const [visibility, setVisibility] = usePersistedState('createTeam.visibility', 'public');
  const [error, setError] = useState('');

  const restoredWhileOpen = useRef(restored && open);
  useEffect(() => {
    if (!open) {
      restoredWhileOpen.current = false;
      return;
    }
    if (restoredWhileOpen.current) return;
    setName('');
    setDescription('');
    setVisibility('public');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the setters are stable; only opening the window re-runs this
  }, [open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give the team a name.');
      return;
    }
    return guard(async () => { await onCreate({ name: name.trim(), description: description.trim(), visibility }); });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a team"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={busy}>{busy ? 'Creating…' : 'Create team'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-fluid-xs font-medium text-ink-500 mb-1.5" htmlFor="grp-name">
            Team name
          </label>
          <input
            id="grp-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Marketing Sprint Squad"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-fluid-xs font-medium text-ink-500 mb-1.5" htmlFor="grp-desc">
            Description (optional)
          </label>
          <textarea
            id="grp-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this team for?"
            className={inputClass}
          />
        </div>

        <div>
          <p className="text-fluid-xs font-medium text-ink-500 mb-1.5">Visibility</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVisibility('public')}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                visibility === 'public'
                  ? 'border-brand-500 bg-brand-500/8'
                  : 'border-ink-500/15 dark:border-white/10 hover:bg-ink-500/5 dark:hover:bg-white/5'
              }`}
            >
              <Globe2 size={16} className="shrink-0 mt-0.5 text-brand-600 dark:text-brand-400" />
              <span>
                <span className="block text-fluid-sm font-medium text-ink-900 dark:text-white">Public</span>
                <span className="block text-fluid-xs text-ink-500">Anyone can find and join it</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setVisibility('private')}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                visibility === 'private'
                  ? 'border-brand-500 bg-brand-500/8'
                  : 'border-ink-500/15 dark:border-white/10 hover:bg-ink-500/5 dark:hover:bg-white/5'
              }`}
            >
              <Lock size={16} className="shrink-0 mt-0.5 text-ink-500" />
              <span>
                <span className="block text-fluid-sm font-medium text-ink-900 dark:text-white">Private</span>
                <span className="block text-fluid-xs text-ink-500">Invite link, code, or added directly</span>
              </span>
            </button>
          </div>
        </div>

        {error && <p className="text-fluid-xs text-coral-500">{error}</p>}
      </form>
    </Modal>
  );
}
