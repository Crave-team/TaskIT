import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './api.mjs';
import { resetDatabase, db } from '../repo.js';
import { setMailer } from '../mailer.js';
import { config } from '../config.js';
import { setGoogleVerifier } from '../google.js';

/**
 * Email codes: after the password, a 6-digit code emailed to the person is the second step of signing in, and of
 * signing up. A fake mailer collects the "emails", so these run with no mail account.
 */
const PW = 'password123';
const INVITE = config.ADMIN_INVITE_CODE;
const DEFAULTS = { ...config };

let outbox;
const codeOf = (message) => message.text.match(/\b(\d{6})\b/)[1];
const lastCode = () => codeOf(outbox.at(-1));
const rejects = (promise, code) => assert.rejects(promise, (e) => e.code === code, `expected ${code}`);
const signedInAs = async () => (await api.bootstrap()).me;

async function member(email = 'maya@gmail.com', name = 'Maya') {
  config.EMAIL_CODE_REQUIRED = false;                // create the account the plain way first
  await api.auth.register({ name, email, password: PW });
  config.EMAIL_CODE_REQUIRED = true;
}

beforeEach(async () => {
  Object.assign(config, DEFAULTS, { EMAIL_CODE_REQUIRED: true, EMAIL_CODE_RESEND_SECONDS: 60 });
  outbox = [];
  setMailer(async (message) => { outbox.push(message); });
  await resetDatabase();
  await api.auth.logout().catch(() => {});
});
afterEach(() => {
  Object.assign(config, DEFAULTS);
  setMailer(null);
});

test('the config tells the forms whether codes are required and whether mail can be sent', async () => {
  assert.deepEqual(await api.auth.getEmailCodeConfig(), { required: true, available: true });
  setMailer(null);
  config.EMAIL_CODE_REQUIRED = false;
  assert.deepEqual(await api.auth.getEmailCodeConfig(), { required: false, available: false });
});

test('password, then code: no session until the emailed code is entered', async () => {
  await member();
  const step1 = await api.auth.login({ email: 'maya@gmail.com', password: PW, expectedRole: 'user' });
  assert.equal(step1.codeRequired, true);
  assert.match(step1.challengeToken, /^[0-9a-f]{64}$/);
  assert.equal(step1.email, 'm***@gmail.com', 'only a masked address goes back to the browser');
  assert.equal(await signedInAs(), null, 'a correct password alone does not sign in');

  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, 'maya@gmail.com');
  assert.match(outbox[0].text, /\b\d{6}\b/);
  assert.equal(outbox[0].text.includes(step1.challengeToken), false, 'the token is never emailed');

  const user = await api.auth.verifyEmailCode({ challengeToken: step1.challengeToken, code: lastCode() });
  assert.equal(user.email, 'maya@gmail.com');
  assert.equal((await signedInAs()).email, 'maya@gmail.com');
});

test('a wrong password never sends a code', async () => {
  await member();
  await rejects(api.auth.login({ email: 'maya@gmail.com', password: 'wrong-password-1' }), 'BAD_PASSWORD');
  await rejects(api.auth.login({ email: 'nobody@gmail.com', password: PW }), 'NO_ACCOUNT');
  assert.equal(outbox.length, 0);
});

test('a code works once only', async () => {
  await member();
  const { challengeToken } = await api.auth.login({ email: 'maya@gmail.com', password: PW });
  const code = lastCode();
  await api.auth.verifyEmailCode({ challengeToken, code });
  await api.auth.logout();
  await rejects(api.auth.verifyEmailCode({ challengeToken, code }), 'CODE_EXPIRED');
  assert.equal(await signedInAs(), null);
});

test('a wrong code is refused with the tries left, and five wrong tries lock it for good', async () => {
  await member();
  const { challengeToken } = await api.auth.login({ email: 'maya@gmail.com', password: PW });
  const right = lastCode();
  const wrong = right === '000000' ? '111111' : '000000';
  await assert.rejects(api.auth.verifyEmailCode({ challengeToken, code: wrong }), (e) => e.code === 'BAD_CODE' && /4 tries left/.test(e.message));
  for (let i = 0; i < 3; i += 1) await rejects(api.auth.verifyEmailCode({ challengeToken, code: wrong }), 'BAD_CODE');
  await rejects(api.auth.verifyEmailCode({ challengeToken, code: wrong }), 'CODE_LOCKED');
  await rejects(api.auth.verifyEmailCode({ challengeToken, code: right }), 'CODE_EXPIRED');   // even the right one is dead now
  assert.equal(await signedInAs(), null);
});

test('the code alone is not enough: the token from the password step is needed, and tokens are not interchangeable', async () => {
  await member('maya@gmail.com', 'Maya');
  await member('ben@gmail.com', 'Ben');
  await rejects(api.auth.verifyEmailCode({ challengeToken: 'f'.repeat(64), code: '123456' }), 'CODE_EXPIRED');
  await rejects(api.auth.verifyEmailCode({ challengeToken: '', code: '123456' }), 'CODE_EXPIRED');

  const maya = await api.auth.login({ email: 'maya@gmail.com', password: PW });
  const mayaCode = lastCode();
  const ben = await api.auth.login({ email: 'ben@gmail.com', password: PW });
  // Ben's token with Maya's code (the mailbox of one, the password of the other) must fail.
  await rejects(api.auth.verifyEmailCode({ challengeToken: ben.challengeToken, code: mayaCode }), 'BAD_CODE');
  assert.equal(await signedInAs(), null);
  await api.auth.verifyEmailCode({ challengeToken: maya.challengeToken, code: mayaCode });
  assert.equal((await signedInAs()).email, 'maya@gmail.com');
});

test('codes must be exactly six digits', async () => {
  await member();
  const { challengeToken } = await api.auth.login({ email: 'maya@gmail.com', password: PW });
  for (const code of ['', 'abcdef', '12345', '1234567', '12 345', null, 123456]) {
    await rejects(api.auth.verifyEmailCode({ challengeToken, code }), 'BAD_REQUEST');
  }
});

test('an expired code is refused', async () => {
  await member();
  const { challengeToken } = await api.auth.login({ email: 'maya@gmail.com', password: PW });
  const code = lastCode();
  const [record] = await db.authChallenges.find({ email: 'maya@gmail.com' });
  await db.authChallenges.update(record.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  await rejects(api.auth.verifyEmailCode({ challengeToken, code }), 'CODE_EXPIRED');
});

test('resending: rate-limited, replaces the old code, and capped per attempt', async () => {
  await member();
  const { challengeToken } = await api.auth.login({ email: 'maya@gmail.com', password: PW });
  const first = lastCode();
  await rejects(api.auth.resendEmailCode({ challengeToken }), 'CODE_TOO_SOON');
  assert.equal(outbox.length, 1);

  config.EMAIL_CODE_RESEND_SECONDS = 0;
  config.EMAIL_CODE_MAX_SENDS = 2;
  const again = await api.auth.resendEmailCode({ challengeToken });
  assert.equal(again.codeRequired, true);
  assert.equal(outbox.length, 2);
  const second = lastCode();
  if (second !== first) await rejects(api.auth.verifyEmailCode({ challengeToken, code: first }), 'BAD_CODE');
  await rejects(api.auth.resendEmailCode({ challengeToken }), 'TOO_MANY_CODES');
  await api.auth.verifyEmailCode({ challengeToken, code: second });
  assert.equal((await signedInAs()).email, 'maya@gmail.com');
  await rejects(api.auth.resendEmailCode({ challengeToken: 'f'.repeat(64) }), 'CODE_EXPIRED');
});

test('starting sign-ins for one address is capped per hour', async () => {
  await member();
  config.EMAIL_CODE_MAX_PER_HOUR = 2;
  await api.auth.login({ email: 'maya@gmail.com', password: PW });
  await api.auth.login({ email: 'maya@gmail.com', password: PW });
  await rejects(api.auth.login({ email: 'maya@gmail.com', password: PW }), 'TOO_MANY_CODES');
  assert.equal(outbox.length, 2, 'no third email was sent');
});

test('only hashes are stored: neither the code nor the token can be read back from the database', async () => {
  await member();
  const { challengeToken } = await api.auth.login({ email: 'maya@gmail.com', password: PW });
  const code = lastCode();
  const [record] = await db.authChallenges.find({ email: 'maya@gmail.com' });
  assert.ok(record.codeHash && record.tokenHash);
  assert.notEqual(record.codeHash, code);
  assert.equal(Object.values(record).includes(code), false);
  assert.equal(JSON.stringify(record).includes(challengeToken), false);
});

test('sign-up needs the emailed code: nothing is created until it is entered, then the person is signed in', async () => {
  const step1 = await api.auth.register({ name: 'Maya Lee', email: 'Maya@Gmail.com ', password: PW });
  assert.equal(step1.codeRequired, true);
  assert.equal((await db.users.find()).length, 0, 'no account exists yet');
  assert.equal(outbox[0].to, 'maya@gmail.com');

  await rejects(api.auth.verifyEmailCode({ challengeToken: step1.challengeToken, code: '000000' === lastCode() ? '111111' : '000000' }), 'BAD_CODE');
  assert.equal((await db.users.find()).length, 0, 'a wrong code creates nothing');

  const user = await api.auth.verifyEmailCode({ challengeToken: step1.challengeToken, code: lastCode() });
  assert.equal(user.email, 'maya@gmail.com');
  assert.equal(user.name, 'Maya Lee');
  assert.equal(user.accountRole, 'user');
  assert.equal(user.tourPending, true);
  assert.equal((await signedInAs()).email, 'maya@gmail.com');
  assert.equal((await db.users.find()).length, 1);
});

test('sign-up checks everything up front: duplicate email, weak password, and the admin invite code, before any email is sent', async () => {
  await member();
  outbox.length = 0;
  await rejects(api.auth.register({ name: 'Dup', email: 'maya@gmail.com', password: PW }), 'CONFLICT');
  await rejects(api.auth.register({ name: 'Weak', email: 'weak@gmail.com', password: 'short' }), 'BAD_REQUEST');
  await rejects(api.auth.register({ name: 'Root', email: 'root@gmail.com', password: PW, accountRole: 'admin', inviteCode: 'wrong' }), 'FORBIDDEN');
  assert.equal(outbox.length, 0);

  const step1 = await api.auth.register({ name: 'Root', email: 'root@gmail.com', password: PW, accountRole: 'admin', inviteCode: INVITE });
  const admin = await api.auth.verifyEmailCode({ challengeToken: step1.challengeToken, code: lastCode() });
  assert.equal(admin.accountRole, 'admin');
  assert.equal(admin.tourPending, false);
});

test('a sign-up cannot be turned into a login for someone else, and the pending account cannot collide', async () => {
  const a = await api.auth.register({ name: 'First', email: 'maya@gmail.com', password: PW });
  const codeA = lastCode();
  const b = await api.auth.register({ name: 'Second', email: 'maya@gmail.com', password: 'different-pass-9' });
  const codeB = lastCode();
  await api.auth.verifyEmailCode({ challengeToken: a.challengeToken, code: codeA });
  await api.auth.logout();
  await rejects(api.auth.verifyEmailCode({ challengeToken: b.challengeToken, code: codeB }), 'CONFLICT');
  assert.equal((await db.users.find()).length, 1);
  assert.equal((await db.users.find())[0].name, 'First');
});

test('portals and bans are checked before a code is sent and again when it is entered', async () => {
  await api.auth.register({ name: 'Root', email: 'root@gmail.com', password: PW, accountRole: 'admin', inviteCode: INVITE })
    .then((c) => api.auth.verifyEmailCode({ challengeToken: c.challengeToken, code: lastCode() }));
  await api.auth.logout();
  await member();
  outbox.length = 0;
  await rejects(api.auth.login({ email: 'maya@gmail.com', password: PW, expectedRole: 'admin' }), 'WRONG_PORTAL');
  await rejects(api.auth.login({ email: 'root@gmail.com', password: PW, expectedRole: 'user' }), 'WRONG_PORTAL');
  assert.equal(outbox.length, 0);

  const pending = await api.auth.login({ email: 'maya@gmail.com', password: PW, expectedRole: 'user' });
  const code = lastCode();
  const [maya] = await db.users.find({ email: 'maya@gmail.com' });
  await db.users.update(maya.id, { status: 'suspended' });      // banned while the code was in the post
  await rejects(api.auth.verifyEmailCode({ challengeToken: pending.challengeToken, code }), 'SUSPENDED');
  assert.equal(await signedInAs(), null);
  await rejects(api.auth.login({ email: 'maya@gmail.com', password: PW }), 'SUSPENDED');
});

test('it fails closed: with no way to send mail, nobody is let in without a code', async () => {
  await member();
  setMailer(null);
  await rejects(api.auth.login({ email: 'maya@gmail.com', password: PW }), 'EMAIL_CODE_UNAVAILABLE');
  await rejects(api.auth.register({ name: 'New', email: 'new@gmail.com', password: PW }), 'EMAIL_CODE_UNAVAILABLE');
  assert.equal(await signedInAs(), null);
  assert.equal((await db.users.find()).length, 1);
});

test('if the email cannot be sent, nothing is stored and no limit is used up', async () => {
  await member();
  setMailer(async () => { throw new Error('SMTP password rejected'); });
  await assert.rejects(api.auth.login({ email: 'maya@gmail.com', password: PW }), (e) => e.code === 'EMAIL_SEND_FAILED' && !/SMTP|password rejected/i.test(e.message));
  assert.equal((await db.authChallenges.find()).length, 0);
  assert.equal(await signedInAs(), null);
});

test('without the server-wide rule, people can opt in from Settings, and only where mail works', async () => {
  await member();
  config.EMAIL_CODE_REQUIRED = false;
  await api.auth.register({ name: 'Ben', email: 'ben@gmail.com', password: PW });
  await api.auth.login({ email: 'maya@gmail.com', password: PW });           // no code: not required, not opted in
  assert.equal((await signedInAs()).email, 'maya@gmail.com');

  setMailer(null);
  await rejects(api.auth.updateProfile({ twoFactor: true }), 'BAD_REQUEST');   // cannot opt in with no mail
  setMailer(async (m) => { outbox.push(m); });
  await api.auth.updateProfile({ twoFactor: true });
  await api.auth.logout();

  const step1 = await api.auth.login({ email: 'maya@gmail.com', password: PW });
  assert.equal(step1.codeRequired, true, 'her own opt-in applies');
  await api.auth.verifyEmailCode({ challengeToken: step1.challengeToken, code: lastCode() });
  await api.auth.updateProfile({ twoFactor: false });
  await api.auth.logout();
  assert.equal((await api.auth.login({ email: 'maya@gmail.com', password: PW })).email, 'maya@gmail.com', 'opted out again');
  await api.auth.logout();
  assert.equal((await api.auth.login({ email: 'ben@gmail.com', password: PW })).email, 'ben@gmail.com', 'others were never affected');
});

test('Google sign-in is its own verified route and does not ask for an emailed code', async () => {
  setGoogleVerifier(async () => ({ sub: 'g-1', email: 'maya@gmail.com', emailVerified: true, name: 'Maya' }));
  const user = await api.auth.loginWithGoogle({ credential: 'any', expectedRole: 'user' });
  assert.equal(user.email, 'maya@gmail.com');
  assert.equal(outbox.length, 0);
});

// ---- forgot password: emailed code + new password -------------------------------------------------------------------

test('reset password: the emailed code and a new password change the password, and the old one stops working', async () => {
  await member();
  const challenge = await api.auth.requestPasswordReset({ email: 'MAYA@gmail.com' });
  assert.equal(challenge.codeRequired, true);
  assert.equal(challenge.email, 'm***@gmail.com');
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, 'maya@gmail.com');
  assert.match(outbox[0].subject, /reset/i);
  assert.equal(outbox[0].text.includes(challenge.challengeToken), false, 'the token is never emailed');
  assert.equal(await signedInAs(), null, 'asking for a reset does not sign anyone in');

  const result = await api.auth.resetPassword({ challengeToken: challenge.challengeToken, code: lastCode(), newPassword: 'brand-new-pass-1' });
  assert.deepEqual(result, { reset: true });
  assert.equal(await signedInAs(), null, 'a reset does not sign anyone in either: you log in with the new password');

  config.EMAIL_CODE_REQUIRED = false;
  await rejects(api.auth.login({ email: 'maya@gmail.com', password: PW }), 'BAD_PASSWORD');
  assert.equal((await api.auth.login({ email: 'maya@gmail.com', password: 'brand-new-pass-1' })).email, 'maya@gmail.com');
});

test('reset password: the answer is the same for an address with no account, and nothing is emailed', async () => {
  await member();
  const real = await api.auth.requestPasswordReset({ email: 'maya@gmail.com' });
  const ghost = await api.auth.requestPasswordReset({ email: 'nobody@gmail.com' });
  assert.deepEqual(Object.keys(ghost).sort(), Object.keys(real).sort());
  assert.equal(outbox.length, 1, 'only the real account got an email');
  await rejects(api.auth.resetPassword({ challengeToken: ghost.challengeToken, code: '123456', newPassword: 'brand-new-pass-1' }), 'CODE_EXPIRED');
});

test('reset password: a banned account gets no code either', async () => {
  await member();
  const user = await db.users.findOne({ email: 'maya@gmail.com' });
  await db.users.update(user.id, { status: 'suspended' });
  const answer = await api.auth.requestPasswordReset({ email: 'maya@gmail.com' });
  assert.equal(answer.codeRequired, true);
  assert.equal(outbox.length, 0);
});

test('reset password: wrong codes are counted and the code works only once', async () => {
  await member();
  const challenge = await api.auth.requestPasswordReset({ email: 'maya@gmail.com' });
  const good = lastCode();
  const wrong = good === '000000' ? '000001' : '000000';
  await rejects(api.auth.resetPassword({ challengeToken: challenge.challengeToken, code: wrong, newPassword: 'brand-new-pass-1' }), 'BAD_CODE');
  await api.auth.resetPassword({ challengeToken: challenge.challengeToken, code: good, newPassword: 'brand-new-pass-1' });
  await rejects(api.auth.resetPassword({ challengeToken: challenge.challengeToken, code: good, newPassword: 'another-pass-22' }), 'CODE_EXPIRED');
});

test('reset password: a too-short new password is refused WITHOUT using up the code', async () => {
  await member();
  const challenge = await api.auth.requestPasswordReset({ email: 'maya@gmail.com' });
  const code = lastCode();
  await rejects(api.auth.resetPassword({ challengeToken: challenge.challengeToken, code, newPassword: 'short' }), 'BAD_REQUEST');
  assert.deepEqual(await api.auth.resetPassword({ challengeToken: challenge.challengeToken, code, newPassword: 'long-enough-pass' }), { reset: true });
});

test('reset password: every existing session of the account is signed out', async () => {
  await member();
  config.EMAIL_CODE_REQUIRED = false;
  await api.auth.login({ email: 'maya@gmail.com', password: PW });
  assert.equal((await signedInAs()).email, 'maya@gmail.com');
  config.EMAIL_CODE_REQUIRED = true;

  const challenge = await api.auth.requestPasswordReset({ email: 'maya@gmail.com' });
  await api.auth.resetPassword({ challengeToken: challenge.challengeToken, code: lastCode(), newPassword: 'brand-new-pass-1' });
  assert.equal(await signedInAs(), null, 'the session that existed before the reset is gone');
});

test('a reset code can never sign anyone in, and a sign-in code can never reset a password', async () => {
  await member();
  const reset = await api.auth.requestPasswordReset({ email: 'maya@gmail.com' });
  const resetCode = lastCode();
  await rejects(api.auth.verifyEmailCode({ challengeToken: reset.challengeToken, code: resetCode }), 'CODE_EXPIRED');
  assert.equal(await signedInAs(), null, 'the reset code did not log in');

  const login = await api.auth.login({ email: 'maya@gmail.com', password: PW, expectedRole: 'user' });
  await rejects(api.auth.resetPassword({ challengeToken: login.challengeToken, code: lastCode(), newPassword: 'brand-new-pass-1' }), 'CODE_EXPIRED');
  // ...and the sign-in challenge was not burnt by that attempt
  assert.equal((await api.auth.verifyEmailCode({ challengeToken: login.challengeToken, code: lastCode() })).email, 'maya@gmail.com');
});

test('reset password: the code can be re-sent, and the new email says it is for a reset', async () => {
  await member();
  config.EMAIL_CODE_RESEND_SECONDS = 0;
  const challenge = await api.auth.requestPasswordReset({ email: 'maya@gmail.com' });
  await api.auth.resendEmailCode({ challengeToken: challenge.challengeToken });
  assert.equal(outbox.length, 2);
  assert.match(outbox[1].subject, /reset/i);
});

test('reset password: without a mail account the request says so instead of pretending to send', async () => {
  await member();
  setMailer(null);
  await rejects(api.auth.requestPasswordReset({ email: 'maya@gmail.com' }), 'EMAIL_CODE_UNAVAILABLE');
});

test('admin sign-in follows the "Require 2FA for admins" switch, not the server-wide default', async () => {
  config.EMAIL_CODE_REQUIRED = false;
  await api.auth.register({ name: 'Boss', email: 'boss@gmail.com', password: PW, accountRole: 'admin', inviteCode: INVITE });
  await api.auth.register({ name: 'Maya', email: 'maya@gmail.com', password: PW });
  config.EMAIL_CODE_REQUIRED = true;                 // the server insists on codes for members...

  // ...but with the admin switch OFF (its default) an admin signs in with the password alone.
  const direct = await api.auth.login({ email: 'boss@gmail.com', password: PW, expectedRole: 'admin' });
  assert.equal(direct.email, 'boss@gmail.com', 'switch off: no code for the admin');
  assert.equal(outbox.length, 0);

  // Turning it ON makes admin sign-in ask for the emailed code.
  await api.auth.updateSettings({ require2fa: true });
  await api.auth.logout();
  const step1 = await api.auth.login({ email: 'boss@gmail.com', password: PW, expectedRole: 'admin' });
  assert.equal(step1.codeRequired, true, 'switch on: the admin must enter a code');
  await api.auth.verifyEmailCode({ challengeToken: step1.challengeToken, code: lastCode() });
  assert.equal((await signedInAs()).email, 'boss@gmail.com');

  // Turning it OFF again stops the prompt right away.
  await api.auth.updateSettings({ require2fa: false });
  await api.auth.logout();
  assert.equal((await api.auth.login({ email: 'boss@gmail.com', password: PW, expectedRole: 'admin' })).email, 'boss@gmail.com');
  await api.auth.logout();

  // Members are unaffected by the admin switch: the server-wide rule still applies to them.
  assert.equal((await api.auth.login({ email: 'maya@gmail.com', password: PW, expectedRole: 'user' })).codeRequired, true);
});

test('an admin who turned on their own code is still asked for it; the admin switch cannot be forced on without mail', async () => {
  config.EMAIL_CODE_REQUIRED = false;
  await api.auth.register({ name: 'Boss', email: 'boss@gmail.com', password: PW, accountRole: 'admin', inviteCode: INVITE });
  await api.auth.login({ email: 'boss@gmail.com', password: PW });
  await api.auth.updateProfile({ twoFactor: true });
  await api.auth.logout();
  const step1 = await api.auth.login({ email: 'boss@gmail.com', password: PW });
  assert.equal(step1.codeRequired, true, 'their personal opt-in applies even with the admin switch off');
  await api.auth.verifyEmailCode({ challengeToken: step1.challengeToken, code: lastCode() });

  setMailer(null);
  await rejects(api.auth.updateSettings({ require2fa: true }), 'BAD_REQUEST');
  assert.equal((await api.auth.getSettings()).require2fa, false, 'refused: nothing was saved, so nobody is locked out');
});
