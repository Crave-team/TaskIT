import { useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import Button from '../common/Button';
import GoogleButton from './GoogleButton';
import EmailCodeStep from './EmailCodeStep';
import { useAuth } from '../../context/AuthContext';

const inputClass =
  'w-full text-fluid-sm bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg px-3 py-2.5 text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';
const labelClass = 'block text-fluid-xs font-medium text-ink-700 dark:text-ink-300 mb-1.5';

/**
 * The sign-in form used by the homepage log-in popup. Handles
 * the member / admin variants (admin is opened from the footer), validation and the "Forgot
 * password?" / "Sign up" links; the host decides what happens next through
 * the callbacks.
 *
 * @param {{
 *  initialEmail?: string,
 *  notice?: string,
 *  autoFocusEmail?: boolean,
 *  onSuccess: () => void,
 *  onForgot: () => void,
 *  onSwitchToSignup?: () => void,
 *  onSwitchToMember?: () => void,
 *  onSwitchToAdminSignup?: () => void,
 *  role?: 'user' | 'admin',
 * }} props
 */
export default function LoginForm({
  initialEmail = '',
  notice = '',
  autoFocusEmail = false,
  onSuccess,
  onForgot,
  onSwitchToSignup,
  onSwitchToMember,
  onSwitchToAdminSignup,
  role = 'user',
}) {
  const { login, loginWithGoogle } = useAuth();
  // The email typed survives a page refresh; the password never does.
  const [email, setEmail] = usePersistedState(`login.${role}.email`, initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [challenge, setChallenge] = useState(null); // set when a 6-digit email code is needed after the password

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter both your email and password.');
      return;
    }
    setSubmitting(true);
    const result = await login({ email, password, expectedRole: role });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    if (result.data?.codeRequired) {
      setChallenge(result.data);
      return;
    }
    onSuccess();
  };

  // Google replies with an ID token; the server verifies it and decides whether this Google account may use this tab.
  const handleGoogle = async (credential) => {
    setError('');
    setSubmitting(true);
    const result = await loginWithGoogle({ credential, expectedRole: role });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSuccess();
  };

  return (
    <>
      {role === 'admin' && (
        <p className="flex items-center gap-2 rounded-xl bg-brand-500/10 px-3.5 py-3 text-fluid-xs font-semibold text-brand-700 dark:text-brand-300">
          <ShieldCheck size={14} /> Administrator access
        </p>
      )}

      {challenge ? (
        <EmailCodeStep challenge={challenge} onVerified={onSuccess} onBack={() => { setChallenge(null); setPassword(''); }} />
      ) : (
      <>
      <form onSubmit={handleSubmit} className="space-y-4 mt-5" noValidate>
        {notice && !error && (
          <div role="status" className="flex items-start gap-2 bg-brand-500/10 text-brand-700 dark:text-brand-300 rounded-lg px-3 py-2.5 text-fluid-xs animate-[fadeIn_300ms_ease-out]">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}
        {error && (
          <div role="alert" className="flex items-start gap-2 bg-coral-500/10 text-coral-600 rounded-lg px-3 py-2.5 text-fluid-xs">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="login-email" className={labelClass}>Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete={notice ? 'off' : 'email'}
            autoFocus={autoFocusEmail}
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="login-password" className={labelClass + ' mb-0'}>Password</label>
            <button
              type="button"
              onClick={onForgot}
              className="text-fluid-xs text-brand-600 hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className={`${inputClass} pr-10`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-900 dark:hover:text-white"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
          {submitting ? 'Signing in…' : role === 'admin' ? 'Sign in as admin' : 'Sign in'}
        </Button>
      </form>

      <GoogleButton text={role === 'admin' ? 'signin_with' : 'continue_with'} onCredential={handleGoogle} disabled={submitting} />
      </>
      )}

      {challenge ? null : role === 'admin' ? (
        <div className="mt-4 space-y-1.5 text-center text-fluid-sm text-ink-500">
          {onSwitchToAdminSignup && (
            <p>
              No admin account yet?{' '}
              <button type="button" onClick={onSwitchToAdminSignup} className="text-brand-600 font-medium hover:underline">
                Create an admin account
              </button>
            </p>
          )}
          {onSwitchToMember && (
            <p>
              Not an admin?{' '}
              <button type="button" onClick={onSwitchToMember} className="text-brand-600 font-medium hover:underline">
                Member log in
              </button>
            </p>
          )}
        </div>
      ) : (
      <p className="text-fluid-sm text-ink-500 text-center mt-4">
        Don't have an account?{' '}
        {onSwitchToSignup ? (
          <button type="button" onClick={onSwitchToSignup} className="text-brand-600 font-medium hover:underline">
            Sign up
          </button>
        ) : (
          <Link to="/?auth=signup" className="text-brand-600 font-medium hover:underline">
            Sign up
          </Link>
        )}
      </p>
      )}
    </>
  );
}
