import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/http/app.js';
import { createServer } from '../src/server.js';
import { serverConfig } from '../src/config.js';
import { createSmtpMailer, createConsoleMailer, chooseMailer } from '../src/http/mailer.js';
import { setMailer } from '../../src/api/mailer.js';
import { config as apiConfig } from '../../src/api/config.js';
import { resetDatabase } from '../../src/api/repo.js';

/**
 * Email codes at the server boundary: the SMTP / console senders, the "refuse to start" safety, and the HTTP behaviour
 * (a session token only after the code, CSRF, injection, error shapes). In-memory repository, fake mail: no database or
 * mail account needed. `npm run test:emailcode`.
 */
const PW = 'password123';
const baseConfig = { ...serverConfig, isTest: true, rateLimit: false, cookieSecure: false, staticDir: '/nonexistent', clientOrigin: '', googleClientId: '' };
const app = createApp({ config: baseConfig, logger: { warn() {}, error() {} } });
const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}/api`;

let outbox;
const lastCode = () => outbox.at(-1).text.match(/\b(\d{6})\b/)[1];

class Browser {
  token = '';
  async call(method, path, body, { csrf = true } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(csrf ? { 'X-Requested-With': 'taskit' } : {}), 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    // This "browser tab" keeps its own token, exactly like the app's sessionStorage does.
    if (json?.sessionToken) this.token = json.sessionToken;
    return { status: res.status, sessionToken: json?.sessionToken, setCookie: res.headers.getSetCookie().join('; '), text, json };
  }
  me() { return this.call('GET', '/bootstrap').then((r) => r.json.data.me); }
}

beforeEach(async () => {
  apiConfig.EMAIL_CODE_REQUIRED = true;
  apiConfig.EMAIL_CODE_RESEND_SECONDS = 60;
  outbox = [];
  setMailer(async (m) => { outbox.push(m); });
  await resetDatabase();
});
after(async () => {
  apiConfig.EMAIL_CODE_REQUIRED = false;
  setMailer(null);
  await new Promise((r) => server.close(r));
});

// ---------------------------------------------------------------- the senders

test('SMTP mailer: hands the message to the transport with the configured sender, and logs failures without the body', async () => {
  const sent = [];
  const logged = [];
  const smtp = { host: 'smtp.gmail.com', port: 465, secure: true, user: 'me@gmail.com', pass: 'app-password', from: 'TaskIT <me@gmail.com>' };
  const ok = createSmtpMailer(smtp, { sendMail: async (m) => { sent.push(m); } }, { error: (l) => logged.push(l) });
  await ok({ to: 'maya@gmail.com', subject: 'Your TaskIT sign-in code', text: 'Your TaskIT sign-in code is 123456' });
  assert.deepEqual(sent, [{ from: 'TaskIT <me@gmail.com>', to: 'maya@gmail.com', subject: 'Your TaskIT sign-in code', text: 'Your TaskIT sign-in code is 123456' }]);

  const failing = createSmtpMailer(smtp, { sendMail: async () => { throw Object.assign(new Error('535 bad credentials'), { code: 'EAUTH' }); } }, { error: (l) => logged.push(l) });
  await assert.rejects(failing({ to: 'maya@gmail.com', subject: 's', text: 'code 654321' }), /535/);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /EAUTH/);
  assert.equal(logged[0].includes('654321'), false, 'the code never reaches the log');
  assert.equal(logged[0].includes('app-password'), false);
});

test('console mailer prints the message for local development', async () => {
  const lines = [];
  await createConsoleMailer((l) => lines.push(l))({ to: 'maya@gmail.com', subject: 'Your TaskIT sign-in code', text: 'Your TaskIT sign-in code is 123456' });
  assert.match(lines.join('\n'), /To: maya@gmail\.com/);
  assert.match(lines.join('\n'), /123456/);
});

test('the sender is chosen from the config: SMTP, the console only in development, otherwise none', () => {
  const smtp = { host: 'smtp.gmail.com', port: 465, secure: true, user: 'me@gmail.com', pass: 'x', from: 'f' };
  assert.equal(chooseMailer({ env: 'production', smtp }).mode, 'smtp');
  assert.equal(chooseMailer({ env: 'development', smtp }).mode, 'smtp');
  assert.equal(chooseMailer({ env: 'development', smtp: { host: '', user: '', pass: '' } }).mode, 'console');
  assert.deepEqual(chooseMailer({ env: 'production', smtp: { host: '', user: '', pass: '' } }), { mode: 'off', mailer: null });
  assert.equal(chooseMailer({ env: 'test', smtp: { host: '', user: '', pass: '' } }).mode, 'off');
  assert.equal(chooseMailer({ env: 'production', smtp: { host: 'h', user: 'u', pass: '' } }).mode, 'off', 'a half-filled SMTP setup is not used');
});

test('the server refuses to start when codes are required but could never be delivered', async () => {
  await assert.rejects(
    createServer({ env: 'production', requireEmailCode: true, smtp: { host: '', user: '', pass: '' } }),
    /Email codes are required but no mail account is set up/,
  );
  apiConfig.EMAIL_CODE_REQUIRED = true; // createServer touched the shared flags; put back what these tests expect
});

// ---------------------------------------------------------------- over HTTP

test('GET /auth/code/config is public', async () => {
  const { status, json } = await new Browser().call('GET', '/auth/code/config');
  assert.equal(status, 200);
  assert.deepEqual(json, { data: { required: true, available: true } });
});

test('sign-up over HTTP: the account and the session exist only after the emailed code', async () => {
  const b = new Browser();
  const step1 = await b.call('POST', '/auth/register', { name: 'Maya Lee', email: 'maya@gmail.com', password: PW });
  assert.equal(step1.status, 200);
  assert.equal(step1.json.data.codeRequired, true);
  assert.equal(step1.sessionToken, undefined, 'no session yet');
  assert.equal(await b.me(), null);
  for (const secret of [lastCode(), PW, 'passwordHash', 'pending']) assert.equal(step1.text.includes(secret), false, `the response must not contain ${secret}`);

  const step2 = await b.call('POST', '/auth/code/verify', { challengeToken: step1.json.data.challengeToken, code: lastCode() });
  assert.equal(step2.status, 200);
  assert.match(step2.sessionToken, /^[0-9a-f]{64}$/, 'the session token is handed over only after the code');
  assert.doesNotMatch(step2.setCookie, /taskit_session=[0-9a-f]{16}/, 'and is never put in a shared cookie');
  assert.equal(step2.json.data.email, 'maya@gmail.com');
  assert.equal('passwordHash' in step2.json.data, false);
  assert.equal((await b.me()).email, 'maya@gmail.com');
});

test('log-in over HTTP: a correct password starts no session until the code is entered', async () => {
  const setup = new Browser();
  apiConfig.EMAIL_CODE_REQUIRED = false;
  await setup.call('POST', '/auth/register', { name: 'Maya', email: 'maya@gmail.com', password: PW });
  apiConfig.EMAIL_CODE_REQUIRED = true;

  const b = new Browser();
  const step1 = await b.call('POST', '/auth/login', { email: 'maya@gmail.com', password: PW, expectedRole: 'user' });
  assert.equal(step1.status, 200);
  assert.equal(step1.json.data.codeRequired, true);
  assert.equal(step1.sessionToken, undefined);
  assert.equal(await b.me(), null);

  const wrong = await b.call('POST', '/auth/code/verify', { challengeToken: step1.json.data.challengeToken, code: lastCode() === '000000' ? '111111' : '000000' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.error.code, 'BAD_CODE');
  assert.equal(wrong.sessionToken, undefined);

  const tooSoon = await b.call('POST', '/auth/code/resend', { challengeToken: step1.json.data.challengeToken });
  assert.equal(tooSoon.status, 429);
  assert.equal(tooSoon.json.error.code, 'CODE_TOO_SOON');

  const done = await b.call('POST', '/auth/code/verify', { challengeToken: step1.json.data.challengeToken, code: lastCode() });
  assert.equal(done.status, 200);
  assert.equal((await b.me()).email, 'maya@gmail.com');

  // The same code cannot be replayed to open another session.
  const replay = await new Browser().call('POST', '/auth/code/verify', { challengeToken: step1.json.data.challengeToken, code: lastCode() });
  assert.equal(replay.status, 401);
  assert.equal(replay.json.error.code, 'CODE_EXPIRED');
});

test('the code routes need the CSRF header and reject injection and junk without a 500', async () => {
  const b = new Browser();
  const noHeader = await b.call('POST', '/auth/code/verify', { challengeToken: 'a'.repeat(64), code: '123456' }, { csrf: false });
  assert.equal(noHeader.status, 403);
  const noHeaderResend = await b.call('POST', '/auth/code/resend', { challengeToken: 'a'.repeat(64) }, { csrf: false });
  assert.equal(noHeaderResend.status, 403);

  assert.equal((await b.call('POST', '/auth/code/verify', { challengeToken: { $ne: null }, code: '123456' })).status, 400);
  assert.equal((await b.call('POST', '/auth/code/verify', { challengeToken: 'a'.repeat(64), code: { $gt: '' } })).status, 400);
  for (const body of [{}, { challengeToken: 5, code: '123456' }, { challengeToken: 'x'.repeat(5000), code: '123456' }, { challengeToken: 'nope', code: '123456' }]) {
    const r = await b.call('POST', '/auth/code/verify', body);
    assert.ok([400, 401].includes(r.status), `junk ${JSON.stringify(body).slice(0, 40)} -> ${r.status}`);
  }
  for (const body of [{}, { challengeToken: 5 }, { challengeToken: 'nope' }]) {
    const r = await b.call('POST', '/auth/code/resend', body);
    assert.ok([400, 401].includes(r.status), `junk resend -> ${r.status}`);
  }
});

test('a send failure is a clean 502, and no session or account appears', async () => {
  setMailer(async () => { throw new Error('connection refused to smtp.gmail.com'); });
  const b = new Browser();
  const r = await b.call('POST', '/auth/register', { name: 'Maya', email: 'maya@gmail.com', password: PW });
  assert.equal(r.status, 502);
  assert.equal(r.json.error.code, 'EMAIL_SEND_FAILED');
  assert.equal(/smtp\.gmail|refused/i.test(r.text), false, 'mail server details stay on the server');
  assert.equal(r.sessionToken, undefined);
});

test('codes required but mail unavailable: the server answers 503 instead of letting people in', async () => {
  setMailer(null);
  const r = await new Browser().call('POST', '/auth/register', { name: 'Maya', email: 'maya@gmail.com', password: PW });
  assert.equal(r.status, 503);
  assert.equal(r.json.error.code, 'EMAIL_CODE_UNAVAILABLE');
});
