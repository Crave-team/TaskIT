import { useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useBusy } from '../../hooks/useBusy';
import { Copy, Check, RefreshCw, LogOut, Trash2, Globe2, Lock } from 'lucide-react';
import Button from '../common/Button';
import { useGroups } from '../../context/GroupContext';
import { panelClass } from './shared';
import VisibilityToggle from './VisibilityToggle';

const fieldClass =
  'w-full rounded-lg border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-dark px-3 text-fluid-sm text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none';

/**
 * Team settings: invite code + link for everyone, edit details, switch Public/Private and rotate the
 * code for the owner, and leave (members) or delete (owner). Public/Private saves the moment it is
 * switched and always reads the team's live value, so it can't go stale if it is also changed on the
 * team card.
 */
export default function AboutTab({ group, isOwner, onGone }) {
  const { updateGroup, regenerateInviteCode, leaveGroup, deleteGroup } = useGroups();
  const [copied, setCopied] = useState('');
  const [guard, busy] = useBusy();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = usePersistedState(`team.${group.id}.about.form`, () => ({ name: group.name, description: group.description || '' }));
  const [saved, setSaved] = useState(false);
  const [visBusy, setVisBusy] = useState(false);
  const inviteLink = `${window.location.origin}/team?code=${group.inviteCode}`;

  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      // Clipboard can be unavailable on insecure origins; the code stays visible to copy by hand.
    }
  };

  const save = (e) => {
    e.preventDefault();
    return guard(async () => {
      if (!form.name.trim()) return;
      const updated = await updateGroup(group.id, { name: form.name.trim(), description: form.description.trim() });
      if (!updated) return;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const changeVisibility = async (visibility) => {
    setVisBusy(true);
    try {
      await updateGroup(group.id, { visibility });
    } finally {
      setVisBusy(false);
    }
  };

  const remove = () => {
    if (!confirmDelete) return setConfirmDelete(true);
    deleteGroup(group.id);
    onGone();
  };

  return (
    <div className="space-y-4">
      <div className={`${panelClass} p-4`}>
        <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white mb-1">Invite people</p>
        <p className="text-fluid-xs text-ink-500 mb-3">Share this code or link. Anyone who uses it sends a request, and a group admin approves it before they join.</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="px-3 py-2 rounded-lg bg-ink-500/8 dark:bg-white/8 text-fluid-sm font-semibold tracking-widest text-ink-900 dark:text-white">
            {group.inviteCode}
          </code>
          <Button size="sm" variant="secondary" icon={copied === 'code' ? <Check size={13} /> : <Copy size={13} />} onClick={() => copy('code', group.inviteCode)}>
            {copied === 'code' ? 'Copied' : 'Copy code'}
          </Button>
          <Button size="sm" variant="secondary" icon={copied === 'link' ? <Check size={13} /> : <Copy size={13} />} onClick={() => copy('link', inviteLink)}>
            {copied === 'link' ? 'Copied' : 'Copy link'}
          </Button>
          {isOwner && (
            <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={() => regenerateInviteCode(group.id)}>
              New code
            </Button>
          )}
        </div>
      </div>

      <form onSubmit={save} className={`${panelClass} p-4 space-y-3`}>
        <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white">About this team</p>
        {isOwner ? (
          <>
            <div>
              <label htmlFor="team-name" className="block text-fluid-xs font-medium text-ink-500 mb-1.5">Team name</label>
              <input id="team-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="team-desc" className="block text-fluid-xs font-medium text-ink-500 mb-1.5">Description</label>
              <textarea id="team-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${fieldClass} py-2 resize-none`} />
            </div>
            <div>
              <p className="block text-fluid-xs font-medium text-ink-500 mb-1.5">Visibility</p>
              <VisibilityToggle value={group.visibility} onChange={changeVisibility} disabled={visBusy} />
              <p className="text-fluid-xs text-ink-500 mt-1.5">
                {group.visibility === 'public' ? 'Public — anyone can find the team and ask to join.' : 'Private — only people with the invite code or link can ask to join.'} Changes apply immediately.
              </p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={busy}>{saved ? 'Saved' : 'Save changes'}</Button>
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <p className="text-fluid-sm text-ink-700 dark:text-ink-300">{group.description || 'No description yet.'}</p>
            <p className="inline-flex items-center gap-1.5 text-fluid-xs text-ink-500">
              {group.visibility === 'public' ? <Globe2 size={13} /> : <Lock size={13} />}
              {group.visibility === 'public' ? 'Public team' : 'Private team'}
            </p>
          </div>
        )}
      </form>

      <div className="flex justify-end">
        {isOwner ? (
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={remove} onBlur={() => setConfirmDelete(false)}>
            {confirmDelete ? 'Click again to confirm' : 'Delete team'}
          </Button>
        ) : (
          <Button variant="secondary" icon={<LogOut size={15} />} onClick={() => { leaveGroup(group.id); onGone(); }}>
            Leave team
          </Button>
        )}
      </div>
    </div>
  );
}
