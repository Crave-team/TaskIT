import { useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { AlertCircle, Eye, EyeOff, KeyRound } from 'lucide-react';
import Button from '../common/Button';
import GoogleButton from './GoogleButton';
import EmailCodeStep from './EmailCodeStep';
import { useAuth } from '../../context/AuthContext';


const inputClass =
  'w-full text-fluid-sm bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg px-3 py-2.5 text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';
const labelClass = 'block text-fluid-xs font-medium text-ink-700 dark:text-ink-300 mb-1.5';

/**
 * Member sign-up form (shown inside the auth popup). TaskIT's single admin
 * account is pre-provisioned, so only member accounts can be created here.
 * Creating an account does NOT sign the person in — `onCreated()` lets
 * the popup switch to a blank log-in view instead.
 *
 * With `role="admin"` the same form registers an ADMIN account and asks for the admin invite code.
 *
 * Google sign-up creates the account AND signs the person in (Google has already proven who they are), so it
 * reports through `onSignedIn` instead of `onCreated`. An ADMIN account still needs the invite code first.
 *
 * When the server emails sign-in codes, creating the account is a TWO-step thing: the details are checked, a 6-digit
 * code is emailed, and the account is only created (and the person signed in, via `onSignedIn`) once it is entered.
 *
 * @param {{ onCreated: () => void, onSignedIn?: () => void, onSwitchToLogin: () => void, role?: 'user' | 'admin' }} props
 */
export default function SignupForm({ onCreated, onSignedIn, onSwitchToLogin, role = 'user' }) {
  const { signup, loginWithGoogle } = useAuth();
  // The name and email typed survive a page refresh. The password, its confirmation and the admin invite code are
  // secrets and are never saved: they start empty again (and are never put in storage).
  const [identity, setIdentity] = usePersistedState(`signup.${role}.identity`, { name: '', email: '' });
  const [secrets, setSecrets] = useState({ password: '', confirm: '', inviteCode: '' });
  const form = { ...identity, ...secrets };
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [challenge, setChallenge] = useState(null); // set when the emailed code is still to be entered

  const update = (key, value) => (key === 'name' || key === 'email' ? setIdentity((f) => ({ ...f, [key]: value })) : setSecrets((f) => ({ ...f, [key]: value })));

  const validate = () => {
    if (!form.name.trim()) return 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return 'Enter a valid email address.';
    if (form.password.length < 8) return 'Password must be at least 8 characters.';
    if (form.password !== form.confirm) return 'Passwords do not match.';
    if (role === 'admin' && !form.inviteCode.trim()) return 'Enter the admin invite code.';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setSubmitting(true);
    const result = await signup({
      name: form.name,
      email: form.email,
      password: form.password,
      accountRole: role,
      inviteCode: form.inviteCode,
      title: '',
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    if (result.data?.codeRequired) {
      setChallenge(result.data);
      return;
    }
    onCreated();
  };

  const handleGoogle = async (credential) => {
    if (role === 'admin' && !form.inviteCode.trim()) {
      setError('Enter the admin invite code first.');
      return;
    }
    setError('');
    setSubmitting(true);
    const result = await loginWithGoogle({ credential, expectedRole: role, inviteCode: form.inviteCode });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSignedIn?.();
  };

  return (
    <>
      <p className="text-fluid-sm text-ink-500 mb-4">
        {role === 'admin' ? 'Register a TaskIT administrator. You will need the admin invite code.' : 'Set up a free TaskIT member account.'}
      </p>
      {challenge ? (
        <EmailCodeStep
          challenge={challenge}
          heading="Confirm your email"
          onVerified={() => (onSignedIn ?? onCreated)()}
          onBack={() => setChallenge(null)}
        />
      ) : (
      <>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="flex items-start gap-2 bg-coral-500/10 text-coral-600 rounded-lg px-3 py-2.5 text-fluid-xs">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="signup-name" className={labelClass}>Full name</label>
          <input
            id="signup-name"
            autoComplete="name"
            autoFocus
            className={inputClass}
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Jordan Lee"
          />
        </div>

        <div>
          <label htmlFor="signup-email" className={labelClass}>Email</label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            className={inputClass}
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="you@company.com"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="signup-password" className={labelClass}>Password</label>
            <div className="relative">
              <input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className={`${inputClass} pr-9`}
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder="8+ characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-900 dark:hover:text-white"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="signup-confirm" className={labelClass}>Confirm password</label>
            <input
              id="signup-confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className={inputClass}
              value={form.confirm}
              onChange={(e) => update('confirm', e.target.value)}
              placeholder="Repeat password"
            />
          </div>
        </div>

        {role === 'admin' && (
          <div>
            <label htmlFor="signup-invite" className={labelClass}>Admin invite code</label>
            <div className="relative">
              <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
              <input
                id="signup-invite"
                autoComplete="off"
                className={`${inputClass} pl-9`}
                value={form.inviteCode}
                onChange={(e) => update('inviteCode', e.target.value)}
                placeholder="Invite code"
              />
            </div>
          </div>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
          {submitting ? 'Creating account…' : role === 'admin' ? 'Create admin account' : 'Create account'}
        </Button>
      </form>

      {onSignedIn && (
        <>
          {role === 'admin' && <p className="text-fluid-xs text-ink-500 text-center mt-4 -mb-2">Enter the invite code above to use Google.</p>}
          <GoogleButton
            text="signup_with"
            onCredential={handleGoogle}
            disabled={submitting || (role === 'admin' && !form.inviteCode.trim())}
          />
        </>
      )}
      </>
      )}

      <p className="text-fluid-sm text-ink-500 text-center mt-5">
        {role === 'admin' ? 'Already an admin?' : 'Already have an account?'}{' '}
        <button type="button" onClick={onSwitchToLogin} className="text-brand-600 font-medium hover:underline">
          Log in
        </button>
      </p>
    </>
  );
}
