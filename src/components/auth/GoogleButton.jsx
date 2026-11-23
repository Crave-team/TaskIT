import { useEffect, useRef, useState } from 'react';
import { initGoogleIdentity, loadGoogleIdentity, setCredentialHandler } from './googleIdentity';
import { useGoogleConfig } from './useGoogleConfig';

/**
 * Google's own "Sign in with Google" button, with an "or" divider above it. Renders nothing when the server has
 * no Google client id configured (and always in the offline demo), so existing screens are unchanged then.
 *
 * `onCredential(idToken)` receives the token Google issues; the caller sends it to the server.
 * `disabled` blocks clicks (e.g. until the admin invite code is typed) without removing the button.
 *
 * @param {{ text?: 'signin_with'|'signup_with'|'continue_with', onCredential: (credential: string) => void, disabled?: boolean }} props
 */
export default function GoogleButton({ text = 'continue_with', onCredential, disabled = false }) {
  const { enabled, clientId } = useGoogleConfig();
  const holder = useRef(null);
  const latest = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  useEffect(() => { latest.current = onCredential; }, [onCredential]);

  useEffect(() => {
    if (!enabled || !clientId) return undefined;
    let cancelled = false;
    loadGoogleIdentity()
      .then((gid) => {
        if (cancelled || !holder.current) return;
        initGoogleIdentity(gid, clientId);
        setCredentialHandler((credential) => latest.current?.(credential));
        const dark = document.documentElement.classList.contains('dark');
        gid.renderButton(holder.current, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          text,
          shape: 'pill',
          logo_alignment: 'left',
          width: Math.min(400, Math.max(200, holder.current.clientWidth || 320)),
        });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      setCredentialHandler(null);
    };
  }, [enabled, clientId, text]);

  if (!enabled) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 text-fluid-xs text-ink-500" aria-hidden="true">
        <span className="h-px flex-1 bg-ink-500/15 dark:bg-white/10" />
        or
        <span className="h-px flex-1 bg-ink-500/15 dark:bg-white/10" />
      </div>
      {failed ? (
        <p role="status" className="mt-3 text-center text-fluid-xs text-ink-500">Google sign-in could not be loaded. Check your connection, or use your email and password.</p>
      ) : (
        <div
          ref={holder}
          className={`mt-3 flex justify-center min-h-[44px] transition-opacity ${disabled ? 'pointer-events-none opacity-50' : ''}`}
          aria-disabled={disabled}
        />
      )}
    </div>
  );
}
