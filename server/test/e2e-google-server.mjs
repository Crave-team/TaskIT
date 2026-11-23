/**
 * A throw-away server for the browser test `e2e/s6_google_auth.py`: the REAL Express app and built front end,
 * running on the in-memory repository, with Google's library replaced by a fake (no Google account or internet
 * needed). Never use this outside testing. Env: STATIC_DIR (built front end), PORT.
 */
import { createApp } from '../src/http/app.js';
import { serverConfig } from '../src/config.js';
import { createGoogleVerifier } from '../src/http/google.js';
import { setGoogleVerifier } from '../../src/api/google.js';
import { config as apiConfig } from '../../src/api/config.js';

const CLIENT_ID = 'e2e-client.apps.googleusercontent.com';
const fakeClient = {
  async verifyIdToken({ idToken, audience }) {
    if (audience !== CLIENT_ID || !idToken.startsWith('valid-')) throw new Error('rejected');
    const id = JSON.parse(Buffer.from(idToken.slice(6), 'base64url').toString());
    return { getPayload: () => ({ sub: id.sub, email: id.email, email_verified: id.verified, name: id.name }) };
  },
};
apiConfig.GOOGLE_CLIENT_ID = CLIENT_ID;
setGoogleVerifier(createGoogleVerifier(CLIENT_ID, fakeClient));

const app = createApp({ config: { ...serverConfig, isTest: true, rateLimit: false, cookieSecure: false, googleClientId: CLIENT_ID, staticDir: process.env.STATIC_DIR } });
const port = Number(process.env.PORT) || 4010;
app.listen(port, '127.0.0.1', () => console.log(`e2e google server on http://127.0.0.1:${port}`));
