import { AlertCircle, CheckCircle2 } from 'lucide-react';
import Button from './Button';

/**
 * Shown for the instant between opening the app and the server saying who is signed in. Without it,
 * a person who is already signed in (their session token is valid) would be bounced to the homepage
 * on every page reload, because for that first moment nobody is known yet.
 *
 * With `error` (the server could not be reached although a session exists) it offers "Try again" instead, so a
 * temporary outage never looks like being signed out.
 *
 * @param {{ error?: string | null, onRetry?: () => void }} props
 */
export default function LoadingScreen({ error = null, onRetry }) {
  return (
    <div role="status" aria-live="polite" className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center bg-surface-light dark:bg-surface-dark">
      <span className={`w-12 h-12 rounded-2xl text-white flex items-center justify-center ${error ? 'bg-coral-500' : 'bg-brand-600 animate-pulse'}`}>
        {error ? <AlertCircle size={26} /> : <CheckCircle2 size={26} />}
      </span>
      {error ? (
        <>
          <p className="text-fluid-sm text-ink-900 dark:text-white font-medium">Can't reach TaskIT right now</p>
          <p className="text-fluid-xs text-ink-500 max-w-sm">{error} You are still signed in.</p>
          {onRetry && <Button onClick={onRetry}>Try again</Button>}
        </>
      ) : (
        <p className="text-fluid-sm text-ink-500">Loading your workspace…</p>
      )}
    </div>
  );
}
