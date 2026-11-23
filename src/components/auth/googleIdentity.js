/**
 * Thin loader for Google Identity Services (the official "Sign in with Google" button).
 * The script is fetched once, on demand (only when the server says Google sign-in is configured), and
 * `initialize` runs once per client id. Google calls back with an ID token, which is forwarded to whichever
 * button is currently mounted. The token is only ever sent to OUR server, which verifies it.
 */
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let loading = null;
let initializedFor = null;
let handler = null;

export function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in did not load.')));
      script.onerror = () => {
        loading = null; // a later attempt (e.g. after reconnecting) may succeed
        script.remove();
        reject(new Error('Google sign-in could not be loaded.'));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

/** Initializes Google's client once; credentials are routed to the handler set by the mounted button. */
export function initGoogleIdentity(gid, clientId) {
  if (initializedFor === clientId) return;
  gid.initialize({
    client_id: clientId,
    callback: (response) => { if (response?.credential) handler?.(response.credential); },
    cancel_on_tap_outside: true,
  });
  initializedFor = clientId;
}

export function setCredentialHandler(fn) {
  handler = fn;
}
