import { ApiError } from './errors.js';

/**
 * "Sign in with Google" needs a trustworthy check that a Google ID token is genuine (signature, audience,
 * expiry). That check can only happen on the server, so the services never verify tokens themselves: they call
 * whatever verifier was plugged in here, exactly like the repository, session store and file storage.
 *
 *   - Express server: `setGoogleVerifier(createGoogleVerifier(clientId))` (see server/src/http/google.js).
 *   - Browser demo (no server): nothing is plugged in, so Google sign-in is simply unavailable. A token
 *     "verified" inside the browser would prove nothing.
 *
 * A verifier takes the raw ID token (the `credential` string Google hands the browser) and either resolves the
 * identity it proves or throws.
 *
 * @typedef {{ sub: string, email: string, emailVerified: boolean, name: string }} GoogleIdentity
 */
let verifier = async () => {
  throw new ApiError(501, 'GOOGLE_UNAVAILABLE', 'Google sign-in is not available on this server.');
};

/** @param {(credential: string) => Promise<GoogleIdentity>} impl */
export const setGoogleVerifier = (impl) => { verifier = impl; };

/** @returns {Promise<GoogleIdentity>} */
export const verifyGoogleCredential = (credential) => verifier(credential);
