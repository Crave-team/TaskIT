import { useEffect, useRef, useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { MailCheck, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Button from '../common/Button';
import { useAuth } from '../../context/AuthContext';

const inputClass =
  'w-full text-fluid-sm bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg px-3 py-2.5 text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';
const codeClass =
  'w-full text-center text-2xl tracking-[0.5em] font-semibold bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg px-3 py-3 text-ink-900 dark:text-white placeholder:text-ink-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/40';
const labelClass = 'block text-fluid-xs font-medium text-ink-700 dark:text-ink-300 mb-1.5';

/** Errors after which the emailed code can never work again: the person has to ask for a new one. */
const DEAD_END = new Set(['CODE_EXPIRED', 'CODE_LOCKED', 'TOO_MANY_CODES']);

function Alert({ children }) {
  return (
    <div role="alert" className="flex items-start gap-2 bg-coral-500/10 text-coral-600 rounded-lg px-3 py-2.5 text-fluid-xs">
      <AlertCircle size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/**
 * Forgot your password, in three steps:
 *   1. type the email on the account  ->  a 6-digit code is emailed (the answer never says whether the address is registered);
 *   2. type the code and a new password  ->  the password is changed and every signed-in session of the account ends;
 *   3. done: go back to log in with the new password.
 * The typed email survives a page refresh; the code, the passwords and the server's challenge token are never saved.
 *
 * It is the form on its own (no modal chrome) so it can live inside the standalone modal AND inside the login popup.
 *
 * @param {{ initialEmail?: string, onDone: () => void, onBack?: () => void }} props
 */
export function ForgotPasswordForm({ initialEmail = '', onDone, onBack }) {
  const { requestPasswordReset, resetPassword, resendEmailCode } = useAuth();
  const [email, setEmail] = usePersistedState('forgotPassword.email', initialEmail);
  const [step, setStep] = useState('email'); // 'email' | 'code' | 'done'
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dead, setDead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const startAgain = () => {
    setStep('email');
    setChallenge(null);
    setCode('');
    setPassword('');
    setConfirm('');
    setError('');
    setNotice('');
    setDead(false);
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Enter the email on your account.');
      return;
    }
    setBusy(true);
    const result = await requestPasswordReset(email);
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setError('');
    setChallenge(result.data);
    setCooldown(result.data.resendIn ?? 60);
    setStep('code');
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your email.');
    if (password.length < 8) return setError('New password must be at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setError('');
    setBusy(true);
    const result = await resetPassword({ challengeToken: challenge.challengeToken, code, newPassword: password });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      setDead(DEAD_END.has(result.code));
      setCode('');
      codeRef.current?.focus();
      return;
    }
    setPassword('');
    setConfirm('');
    setStep('done');
  };

  const handleResend = async () => {
    setError('');
    setNotice('');
    const result = await resendEmailCode({ challengeToken: challenge.challengeToken });
    if (!result.success) {
      setError(result.error);
      setDead(DEAD_END.has(result.code));
      return;
    }
    setCode('');
    setCooldown(result.data.resendIn ?? 60);
    setNotice('A new code is on its way. The old one no longer works.');
    codeRef.current?.focus();
  };

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center text-center py-4 animate-[fadeIn_300ms_ease-out]">
        <div className="w-11 h-11 rounded-full bg-sage-500/10 flex items-center justify-center mb-3">
          <CheckCircle2 size={20} className="text-sage-600" />
        </div>
        <p className="text-fluid-sm text-ink-900 dark:text-white font-medium">Password changed</p>
        <p className="text-fluid-xs text-ink-500 mt-1 max-w-xs">
          Log in with your new password. Anywhere you were signed in has been signed out.
        </p>
        <Button variant="primary" size="sm" className="mt-4" onClick={onBack || onDone}>
          {onBack ? 'Back to log in' : 'Done'}
        </Button>
      </div>
    );
  }

  if (step === 'code') {
    return (
      <form onSubmit={handleReset} className="space-y-4" noValidate>
        <div className="flex items-start gap-3 rounded-xl bg-brand-500/10 px-3.5 py-3 text-fluid-sm text-brand-700 dark:text-brand-300">
          <MailCheck size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Check your email</p>
            <p className="text-fluid-xs mt-0.5">
              If <strong>{email}</strong> has an account, we sent a 6-digit code to it. It works once and expires in 10 minutes.
            </p>
          </div>
        </div>
        {notice && !error && (
          <div role="status" className="flex items-start gap-2 bg-brand-500/10 text-brand-700 dark:text-brand-300 rounded-lg px-3 py-2.5 text-fluid-xs">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}
        {error && <Alert>{error}</Alert>}
        <div>
          <label htmlFor="reset-code" className={labelClass}>6-digit code</label>
          <input
            id="reset-code"
            ref={codeRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            className={codeClass}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            disabled={dead}
          />
        </div>
        <div>
          <label htmlFor="reset-password" className={labelClass}>New password</label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            disabled={dead}
          />
        </div>
        <div>
          <label htmlFor="reset-confirm" className={labelClass}>Confirm new password</label>
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={dead}
          />
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled={busy || dead}>
          {busy ? 'Saving…' : 'Change password'}
        </Button>
        <div className="flex items-center justify-between text-fluid-xs">
          <button type="button" onClick={startAgain} className="text-ink-500 hover:underline">
            {dead ? 'Start again' : 'Use a different email'}
          </button>
          {!dead && (
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0}
              className="text-brand-600 font-medium hover:underline disabled:text-ink-500 disabled:no-underline disabled:cursor-not-allowed"
            >
              {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleRequest} className="space-y-4" noValidate>
      <p className="text-fluid-sm text-ink-500">
        Enter the email on your account and we'll email you a 6-digit code to set a new password.
      </p>
      {error && <Alert>{error}</Alert>}
      <div>
        <label htmlFor="reset-email" className={labelClass}>Email</label>
        <input
          id="reset-email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className={inputClass}
        />
      </div>
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'Sending…' : 'Send code'}
      </Button>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mx-auto flex items-center gap-1.5 text-fluid-xs text-ink-500 hover:text-brand-600 transition-colors"
        >
          <ArrowLeft size={13} /> Back to log in
        </button>
      )}
    </form>
  );
}
