import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, MailCheck } from 'lucide-react';
import Button from '../common/Button';
import { useAuth } from '../../context/AuthContext';

const inputClass =
  'w-full text-center text-2xl tracking-[0.5em] font-semibold bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg px-3 py-3 text-ink-900 dark:text-white placeholder:text-ink-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

/** Error codes after which the code can never work again: the person has to start over from the password. */
const DEAD_END = new Set(['CODE_EXPIRED', 'CODE_LOCKED', 'TOO_MANY_CODES']);

/**
 * Second step of signing in or signing up: the 6-digit code emailed to the person.
 * `challenge` is what the server answered after the password (`challengeToken`, the masked `email`, `resendIn`).
 * `onVerified` runs once the code is accepted and the session exists; `onBack` returns to the password form.
 *
 * @param {{ challenge: { challengeToken: string, email: string, resendIn: number }, onVerified: () => void, onBack: () => void, heading?: string }} props
 */
export default function EmailCodeStep({ challenge, onVerified, onBack, heading = 'Check your email' }) {
  const { verifyEmailCode, resendEmailCode } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [dead, setDead] = useState(false);
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(challenge.resendIn ?? 60);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setError('');
    setNotice('');
    setSubmitting(true);
    const result = await verifyEmailCode({ challengeToken: challenge.challengeToken, code });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      setDead(DEAD_END.has(result.code));
      setCode('');
      inputRef.current?.focus();
      return;
    }
    onVerified();
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
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-5" noValidate>
      <div className="flex items-start gap-3 rounded-xl bg-brand-500/10 px-3.5 py-3 text-fluid-sm text-brand-700 dark:text-brand-300">
        <MailCheck size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">{heading}</p>
          <p className="text-fluid-xs mt-0.5">We sent a 6-digit code to <strong>{challenge.email}</strong>. It works once and expires in 10 minutes.</p>
        </div>
      </div>

      {notice && !error && (
        <div role="status" className="flex items-start gap-2 bg-brand-500/10 text-brand-700 dark:text-brand-300 rounded-lg px-3 py-2.5 text-fluid-xs">
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
        <label htmlFor="email-code" className="block text-fluid-xs font-medium text-ink-700 dark:text-ink-300 mb-1.5">6-digit code</label>
        <input
          id="email-code"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="one-time-code"
          className={inputClass}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="••••••"
          disabled={dead}
        />
      </div>

      <Button type="submit" variant="primary" className="w-full" disabled={submitting || dead || code.length !== 6}>
        {submitting ? 'Checking…' : 'Verify and continue'}
      </Button>

      <div className="flex items-center justify-between text-fluid-xs">
        <button type="button" onClick={onBack} className="text-ink-500 hover:underline">
          {dead ? 'Start again' : 'Back'}
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
