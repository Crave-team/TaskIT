import { OAuth2Client } from 'google-auth-library';

/**
 * The real Google ID-token verifier plugged into the services (`setGoogleVerifier`).
 *
 * `verifyIdToken` checks the token's signature against Google's published keys, that it was issued by Google, that
 * it has not expired, and that its audience is OUR client id (so a token minted for some other app is refused).
 * Anything wrong makes it throw, which the service turns into a 401.
 *
 * `client` is injectable so tests can run without contacting Google.
 */
export function createGoogleVerifier(clientId, client = new OAuth2Client()) {
  if (!clientId) throw new Error('A Google client id is required to verify tokens.');
  return async function verify(credential) {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new Error('The Google token carries no identity.');
    return {
      sub: payload.sub,
      email: payload.email,
      // Strictly `true`: a missing or "false" claim must never count as verified.
      emailVerified: payload.email_verified === true,
      name: payload.name || '',
    };
  };
}
