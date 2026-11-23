import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';

/**
 * Asked once when you join a team that has roles: choose the one you hold there.
 * The parent re-keys it per opening, so its state starts fresh each time. `onPick(roleId)` resolves like the join calls do ({ success, error? }); the parent closes this on success.
 *
 * @param {{ open: boolean, teamName: string, roles: { id: string, name: string }[], onPick: (roleId: string) => Promise<{ success: boolean, error?: string }>, onClose: () => void }} props
 */
export default function PickRoleModal({ open, teamName, roles, onPick, onClose }) {
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (!roleId) { setError('Choose a role to continue.'); return; }
    setBusy(true);
    const result = await onPick(roleId);
    setBusy(false);
    if (!result.success) setError(result.error || 'Could not send your request.');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Join ${teamName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Request to join'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <fieldset>
          <legend className="text-fluid-xs font-medium text-ink-500 mb-1.5">What is your role in this team?</legend>
          <ul className="space-y-1.5">
            {roles.map((r) => (
              <li key={r.id}>
                <label className="flex items-center gap-2.5 rounded-lg border border-ink-500/15 dark:border-white/10 px-3 py-2 text-fluid-sm text-ink-900 dark:text-white cursor-pointer has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/5">
                  <input type="radio" name="join-role" value={r.id} checked={roleId === r.id} onChange={() => setRoleId(r.id)} />
                  {r.name}
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-fluid-xs text-ink-500">New tasks are handed to people by role. After you join, only a team admin can change your role, and you will be asked to accept it.</p>
        </fieldset>
        {error && <p role="alert" className="text-fluid-xs text-coral-500">{error}</p>}
      </form>
    </Modal>
  );
}
