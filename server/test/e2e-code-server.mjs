/**
 * A throw-away server for the browser test `e2e/s7_email_code.py`: the REAL Express app and built front end on the
 * in-memory repository, with email codes REQUIRED and a mailer that appends every "email" to a file the test reads
 * (so no mail account is needed). Never use this outside testing. Env: STATIC_DIR, PORT, MAIL_LOG.
 */
import fs from 'node:fs';
import { createApp } from '../src/http/app.js';
import { serverConfig } from '../src/config.js';
import { setMailer } from '../../src/api/mailer.js';
import { config as apiConfig } from '../../src/api/config.js';

const log = process.env.MAIL_LOG || '/tmp/taskit-mail.jsonl';
fs.writeFileSync(log, '');
apiConfig.EMAIL_CODE_REQUIRED = true;
setMailer(async (message) => { fs.appendFileSync(log, `${JSON.stringify(message)}\n`); });

const app = createApp({ config: { ...serverConfig, isTest: true, rateLimit: false, cookieSecure: false, googleClientId: '', staticDir: process.env.STATIC_DIR } });
const port = Number(process.env.PORT) || 4011;
app.listen(port, '127.0.0.1', () => console.log(`e2e email-code server on http://127.0.0.1:${port}`));
