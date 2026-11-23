import { useEffect, useRef, useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import Modal from '../common/Modal';
import Button from '../common/Button';

const inputClass =
  'w-full rounded-lg border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-dark px-3 py-2 text-fluid-sm text-ink-900 dark:text-white placeholder:text-ink-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/40 tracking-widest uppercase';

/**
 * Request to join a team with an invite code — the same code that's embedded in a
 * shareable invite link, so this one form covers both "I have a code" and
 * "I clicked a link" (the link just pre-fills this).
 *
 * @param {{ open: boolean, onClose: () => void, initialCode?: string, onJoin: (code: string) => Promise<{ success: boolean, error?: string, alreadyMember?: boolean, group?: object } }} props
 */
export default function JoinGroupModal({ open, onClose, initialCode = '', onJoin }) {
  const [code, setCode, restored] = usePersistedState('joinTeam.code', initialCode);
  const [error, setError] = useState('');

  // After a page refresh the window comes back with the code already typed: skip the reset for that one opening.
  const restoredWhileOpen = useRef(restored && open);
  useEffect(() => {
    if (!open) {
      restoredWhileOpen.current = false;
      return;
    }
    if (restoredWhileOpen.current) return;
    setCode(initialCode);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the setter is stable
  }, [open, initialCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Enter an invite code.');
      return;
    }
    const result = await onJoin(code);
    if (!result.success) {
      setError(result.error || "That code didn't match any team.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join a team"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Request to join</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-fluid-xs font-medium text-ink-500 mb-1.5" htmlFor="join-code">
            Invite code
          </label>
          <input
            id="join-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. LAUNCH1"
            className={inputClass}
            autoFocus
          />
          <p className="mt-1.5 text-fluid-xs text-ink-500">
            Ask a team admin for their invite code or link. Your request is sent to the team's admins, and you get in once one of them approves it.
          </p>
        </div>
        {error && <p className="text-fluid-xs text-coral-500">{error}</p>}
      </form>
    </Modal>
  );
}
