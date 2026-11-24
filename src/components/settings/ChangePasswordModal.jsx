import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { useAuth } from '../../context/AuthContext';

const emptyForm = { current: '', next: '', confirm: '' };

/** 0–4 score from length and character variety. */
function strengthOf(pw) {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
  return score;
}
const STRENGTH = [
  { label: 'Too short', bar: 'bg-coral-500', text: 'text-coral-600' },
  { label: 'Weak', bar: 'bg-coral-500', text: 'text-coral-600' },
  { label: 'Okay', bar: 'bg-amber-500', text: 'text-amber-600' },
  { label: 'Good', bar: 'bg-sage-500', text: 'text-sage-600' },
  { label: 'Strong', bar: 'bg-brand-600', text: 'text-brand-700 dark:text-brand-300' },
];

function PasswordField({ id, label, value, onChange, error, autoComplete, children }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-fluid-xs font-medium text-ink-700 dark:text-ink-300 mb-1.5">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          className={`w-full text-fluid-sm bg-white dark:bg-surface-dark border rounded-lg pl-3 pr-10 py-2 text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none ${
            error ? 'border-coral-500' : 'border-ink-500/15 dark:border-white/10'
          }`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-900 dark:hover:text-white"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {children}
      {error && <p role="alert" className="text-fluid-xs text-coral-600 mt-1">{error}</p>}
    </div>
  );
}

/**
 * Change-password dialog. It checks the current password against the signed-in
 * account and, on success, really updates the account — so the next log-in needs the
 * new password (this used to just show a success message without saving anything).
 *
 * @param {{ open: boolean, onClose: () => void }} props
 */
export default function ChangePasswordModal({ open, onClose }) {
  const { currentUser, changePassword } = useAuth();
  // An account created with Google has no password yet; being signed in is the proof, so it only sets a new one.
  const hasPassword = currentUser?.hasPassword !== false;
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setErrors({});
      setSuccess(false);
    }
  }, [open]);

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const e = {};
    if (hasPassword && !form.current) e.current = 'Enter your current password.';
    if (!form.next || form.next.length < 8) e.next = 'New password must be at least 8 characters.';
    else if (hasPassword && form.next === form.current) e.next = 'Choose a password different from your current one.';
    if (form.confirm !== form.next) e.confirm = 'Passwords do not match.';
    if (Object.keys(e).length) return setErrors(e);

    const result = await changePassword(currentUser.id, form.current, form.next);
    if (!result.success) return setErrors({ [result.field || 'current']: result.error });
    setSuccess(true);
  };

  const strength = strengthOf(form.next);
  const meta = STRENGTH[form.next ? strength : 0];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={hasPassword ? 'Change password' : 'Set a password'}
      footer={
        success ? (
          <Button variant="primary" onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit}>{hasPassword ? 'Update password' : 'Set password'}</Button>
          </>
        )
      }
    >
      {success ? (
        <div className="flex flex-col items-center text-center py-6">
          <CheckCircle2 size={36} className="text-sage-500 mb-3" />
          <p className="text-fluid-sm font-medium text-ink-900 dark:text-white">Password updated</p>
          <p className="text-fluid-xs text-ink-500 mt-1">Use your new password the next time you log in.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <p className="flex items-start gap-2 rounded-lg bg-brand-500/10 px-3 py-2 text-fluid-xs text-ink-700 dark:text-ink-300">
            <ShieldCheck size={14} className="text-brand-600 mt-0.5 shrink-0" />
            {hasPassword
              ? 'Confirm your current password, then choose a new one of at least 8 characters.'
              : 'You sign in with Google. Choose a password of at least 8 characters if you also want to log in with your email.'}
          </p>
          {hasPassword && (
            <PasswordField id="current-password" label="Current password" value={form.current} onChange={set('current')} error={errors.current} autoComplete="current-password" />
          )}
          <PasswordField id="new-password" label="New password" value={form.next} onChange={set('next')} error={errors.next} autoComplete="new-password">
            {form.next && (
              <div className="mt-2 flex items-center gap-2" aria-live="polite">
                <div className="flex flex-1 gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= strength ? meta.bar : 'bg-ink-500/15 dark:bg-white/10'}`} />
                  ))}
                </div>
                <span className={`text-fluid-xs font-medium ${meta.text}`}>{meta.label}</span>
              </div>
            )}
          </PasswordField>
          <PasswordField id="confirm-password" label="Confirm new password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" />
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      )}
    </Modal>
  );
}
