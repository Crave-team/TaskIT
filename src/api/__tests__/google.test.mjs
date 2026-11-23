import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './api.mjs';
import { resetDatabase, db } from '../repo.js';
import { setGoogleVerifier } from '../google.js';
import { config } from '../config.js';

/**
 * Google sign-in / sign-up for members and admins. A fake verifier stands in for Google: the "credential" is a
 * JSON identity, and anything marked `forged` is rejected like a token whose signature does not check out. The
 * REAL verifier (signature, audience, expiry) is covered in server/test/google.test.mjs.
 */
const PW = 'password123';
const INVITE = config.ADMIN_INVITE_CODE;

const cred = (over = {}) => JSON.stringify({ sub: 'g-maya', email: 'maya@gmail.com', emailVerified: true, name: 'Maya Lee', ...over });
setGoogleVerifier(async (credential) => {
  const identity = JSON.parse(credential);
  if (identity.forged) throw new Error('bad signature');
  return identity;
});
const rejects = (promise, code) => assert.rejects(promise, (e) => e.code === code || e.status === code);

beforeEach(async () => {
  await resetDatabase();
  await api.auth.logout().catch(() => {});
});
after(() => { config.GOOGLE_CLIENT_ID = ''; });

test('the Google button is configured from the server, and off by default', async () => {
  assert.deepEqual(await api.auth.getGoogleConfig(), { enabled: false, clientId: null });
  config.GOOGLE_CLIENT_ID = 'abc.apps.googleusercontent.com';
  assert.deepEqual(await api.auth.getGoogleConfig(), { enabled: true, clientId: 'abc.apps.googleusercontent.com' });
  config.GOOGLE_CLIENT_ID = '';
});

test('first Google sign-in creates a member account and signs them in', async () => {
  const user = await api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'user' });
  assert.equal(user.email, 'maya@gmail.com');
  assert.equal(user.name, 'Maya Lee');
  assert.equal(user.accountRole, 'user');
  assert.equal(user.tourPending, true);
  assert.equal(user.hasPassword, false);
  assert.equal(user.googleLinked, true);
  assert.equal('passwordHash' in user, false);
  assert.equal('googleId' in user, false, 'the Google subject id never reaches the client');
  assert.equal((await api.bootstrap()).me.email, 'maya@gmail.com', 'a real session was started');
});

test('signing in again with Google reuses the same account, even if the Google email changed', async () => {
  const first = await api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'user' });
  await api.auth.logout();
  const again = await api.auth.loginWithGoogle({ credential: cred({ email: 'maya.new@gmail.com' }), expectedRole: 'user' });
  assert.equal(again.id, first.id);
  assert.equal(again.email, 'maya@gmail.com');
  assert.equal((await db.users.find()).length, 1);
});

test('a forged, unverified or malformed Google token is refused and creates nothing', async () => {
  await rejects(api.auth.loginWithGoogle({ credential: cred({ forged: true }), expectedRole: 'user' }), 'BAD_GOOGLE_TOKEN');
  await rejects(api.auth.loginWithGoogle({ credential: cred({ emailVerified: false }), expectedRole: 'user' }), 'EMAIL_NOT_VERIFIED');
  await rejects(api.auth.loginWithGoogle({ credential: cred({ emailVerified: 'true' }), expectedRole: 'user' }), 'EMAIL_NOT_VERIFIED');
  await rejects(api.auth.loginWithGoogle({ credential: cred({ email: 'not-an-email' }), expectedRole: 'user' }), 'BAD_GOOGLE_TOKEN');
  await rejects(api.auth.loginWithGoogle({ credential: cred({ sub: '' }), expectedRole: 'user' }), 'BAD_GOOGLE_TOKEN');
  await rejects(api.auth.loginWithGoogle({ credential: '', expectedRole: 'user' }), 'BAD_REQUEST');
  await rejects(api.auth.loginWithGoogle({ credential: 'x'.repeat(5000), expectedRole: 'user' }), 'BAD_REQUEST');
  await rejects(api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'root' }), 'BAD_REQUEST');
  assert.equal((await db.users.find()).length, 0);
  assert.deepEqual(await api.bootstrap(), { me: null });
});

test('admin portal: no account and no invite code creates nothing', async () => {
  await rejects(api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'admin' }), 'NO_ACCOUNT');
  await rejects(api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'admin', inviteCode: '   ' }), 'NO_ACCOUNT');
  assert.equal((await db.users.find()).length, 0);
});

test('admin sign-up with Google needs the invite code, then later sign-ins do not', async () => {
  await rejects(api.auth.loginWithGoogle({ credential: cred({ sub: 'g-root', email: 'root@gmail.com' }), expectedRole: 'admin', inviteCode: 'wrong' }), 'FORBIDDEN');
  assert.equal((await db.users.find()).length, 0);

  const admin = await api.auth.loginWithGoogle({ credential: cred({ sub: 'g-root', email: 'root@gmail.com', name: 'Root' }), expectedRole: 'admin', inviteCode: INVITE });
  assert.equal(admin.accountRole, 'admin');
  assert.equal(admin.tourPending, false);
  assert.equal(admin.title, 'Workspace Administrator');
  assert.equal((await api.bootstrap()).me.accountRole, 'admin');

  await api.auth.logout();
  const again = await api.auth.loginWithGoogle({ credential: cred({ sub: 'g-root', email: 'root@gmail.com' }), expectedRole: 'admin' });
  assert.equal(again.id, admin.id);
});

test('a Google account cannot cross portals: members never become admins, admins are not members', async () => {
  const member = await api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'user' });
  await api.auth.logout();
  // Even WITH the right invite code, an existing member is not promoted.
  await rejects(api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'admin', inviteCode: INVITE }), 'WRONG_PORTAL');
  assert.equal((await db.users.get(member.id)).accountRole, 'user');

  await api.auth.loginWithGoogle({ credential: cred({ sub: 'g-root', email: 'root@gmail.com' }), expectedRole: 'admin', inviteCode: INVITE });
  await api.auth.logout();
  await rejects(api.auth.loginWithGoogle({ credential: cred({ sub: 'g-root', email: 'root@gmail.com' }), expectedRole: 'user' }), 'WRONG_PORTAL');
});

test('an existing password account is linked by its verified email; the old password stops working and old sessions end', async () => {
  await api.auth.register({ name: 'Maya', email: 'maya@gmail.com', password: PW });
  await api.auth.login({ email: 'maya@gmail.com', password: PW });
  const oldSession = (await api.bootstrap()).me.id;
  assert.ok(oldSession);

  await api.auth.logout();
  const linked = await api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'user' });
  assert.equal(linked.id, oldSession, 'same account, not a duplicate');
  assert.equal(linked.hasPassword, false);
  assert.equal((await db.users.find()).length, 1);
  // The password might have been set by someone else before the owner ever signed in, so it is switched off.
  await api.auth.logout();
  await rejects(api.auth.login({ email: 'maya@gmail.com', password: PW }), 'USE_GOOGLE');
});

test('a Google-only account can set a password and then use either method', async () => {
  await api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'user' });
  await rejects(api.auth.changePassword({ current: '', next: 'short' }), 'BAD_REQUEST');
  await api.auth.changePassword({ current: '', next: 'a-new-password-1' });
  assert.equal((await api.auth.getMe()).hasPassword, true);
  await api.auth.logout();
  const viaPassword = await api.auth.login({ email: 'maya@gmail.com', password: 'a-new-password-1', expectedRole: 'user' });
  assert.equal(viaPassword.googleLinked, true);
  await api.auth.logout();
  await api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'user' });
  // With a password set, "current" is required again.
  await rejects(api.auth.changePassword({ current: 'wrong-password', next: 'another-one-22' }), 'BAD_REQUEST');
});

test('an email tied to one Google account cannot be claimed by another', async () => {
  await api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'user' });
  await api.auth.logout();
  await rejects(api.auth.loginWithGoogle({ credential: cred({ sub: 'g-someone-else' }), expectedRole: 'user' }), 'GOOGLE_MISMATCH');
  assert.equal((await db.users.find()).length, 1);
});

test('banned accounts cannot sign in with Google, and a banned Google user is signed out', async () => {
  await api.auth.register({ name: 'Admin', email: 'admin@x.com', password: PW, accountRole: 'admin', inviteCode: INVITE });
  const maya = await api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'user' });
  await api.auth.logout();
  await api.auth.login({ email: 'admin@x.com', password: PW, expectedRole: 'admin' });
  await api.auth.setAccountStatus(maya.id, 'suspended');
  await api.auth.logout();
  await rejects(api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'user' }), 'SUSPENDED');
});

// Uniqueness is a database guarantee (unique indexes on email and googleId), so only a real MongoDB can prove it.
test('two first-time Google sign-ins at once make one account', { skip: process.env.TEST_DB !== 'mongo' && 'needs MongoDB unique indexes' }, async () => {
  const results = await Promise.allSettled([
    api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'user' }),
    api.auth.loginWithGoogle({ credential: cred(), expectedRole: 'user' }),
  ]);
  assert.ok(results.every((r) => r.status === 'fulfilled' || r.reason.code === 'CONFLICT'));
  assert.equal((await db.users.find()).length, 1);
});
