import { db, settingsStore, transaction } from '../repo.js';
import { badRequest, conflict, forbidden, notFound, ApiError } from '../errors.js';
import { nowISO, requireActor, requireSiteAdmin, logActivity, releaseFile, isDuplicateKey } from '../core.js';
import { hashPassword, verifyPassword } from '../password.js';
import { createSession, destroySession, destroySessionsFor } from '../session.js';
import { verifyGoogleCredential } from '../google.js';
import { hasMailer } from '../mailer.js';
import { issueChallenge, consumeChallenge, decoyChallenge } from './emailCodeService.js';
import { privateUser } from '../views.js';
import { config } from '../config.js';
import { removeUserFromTeams } from './teamService.js';
import { removeUserWork } from './taskService.js';

/**
 * Accounts, sign-in, profile, and the admin's user management + site settings.
 *
 * Emails are stored lower-cased and are unique (a unique index in MongoDB); passwords are salted
 * and hashed, never stored or returned; who is signed in comes from the session token.
 */

export const DEFAULT_PREFS = { dueReminders: true, dailyDigest: true, mentions: true };

// Email codes live in their own service; the sign-in steps they add are part of this one (and of the route table).
export { resendEmailCode, getEmailCodeConfig } from './emailCodeService.js';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const EMAIL_RE = /^\S+@\S+\.\S+$/;

// ---------------------------------------------------------------- registration & sign-in

/**
 * Creates an account. It does NOT sign the person in.
 *
 * When email codes are required, nothing is created yet: the validated account waits inside a challenge and is created
 * only when the 6-digit code emailed to the address is entered (so nobody can register an address they cannot read).
 * Then the answer is `{ codeRequired: true, challengeToken, ... }` instead of the new account.
 */
export async function register({ name, email, password, accountRole = 'user', inviteCode = '', title = '' }) {
  [name, email, password, inviteCode, title].forEach((v) => { if (typeof v !== 'string') throw badRequest('Invalid input.'); });
  if (!name.trim()) throw badRequest('Enter your full name.', 'name');
  if (!EMAIL_RE.test(normalizeEmail(email))) throw badRequest('Enter a valid email address.', 'email');
  if (!password || password.length < 8) throw badRequest('Password must be at least 8 characters.', 'password');
  if (await db.users.findOne({ email: normalizeEmail(email) })) throw conflict('An account with this email already exists.', 'email');
  const role = accountRole === 'admin' ? 'admin' : 'user';
  if (role === 'admin' && inviteCode.trim() !== config.ADMIN_INVITE_CODE) throw forbidden('Invalid admin invite code.');
  const account = {
    name: name.trim(),
    email: normalizeEmail(email),
    passwordHash: await hashPassword(password),
    accountRole: role,
    title: title.trim() || (role === 'admin' ? 'Workspace Administrator' : 'Team Member'),
  };
  if (config.EMAIL_CODE_REQUIRED) {
    return issueChallenge({ purpose: 'signup', email: account.email, pending: account, expectedRole: role });
  }
  return privateUser(await insertAccount(account));
}

/** Inserts a password account. Two sign-ups racing for one email: the unique index on `email` picks the winner. */
async function insertAccount({ name, email, passwordHash, accountRole, title }) {
  try {
    return await db.users.insert({
      name,
      email,
      passwordHash,
      accountRole,
      title,
      status: 'active',
      prefs: { ...DEFAULT_PREFS },
      avatarUrl: null,
      avatarFileId: null,
      avatarColor: 'brand',
      twoFactor: false,
      // New MEMBER accounts get the guided tour once; admins never see it.
      tourPending: accountRole !== 'admin',
      createdAt: nowISO(),
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw conflict('An account with this email already exists.', 'email');
    throw e;
  }
}

/**
 * Does this person have to enter an emailed code after their password?
 *   - anyone who switched two-step sign-in on for their own account (Settings);
 *   - ADMIN accounts: only when "Require 2FA for admins" is on in System Settings. The admin switch is the rule for
 *     admins, so turning it off really does stop the code prompt (the server-wide default below does not override it);
 *   - everyone else: when the server makes codes compulsory (`EMAIL_CODE_REQUIRED`).
 */
async function needsLoginCode(user) {
  if (user.twoFactor) return true;
  if (user.accountRole === 'admin') return Boolean((await settingsStore.get()).require2fa);
  return Boolean(config.EMAIL_CODE_REQUIRED);
}

/**
 * Signs in with email + password.
 * @returns {{ user, token } | { codeRequired: true, challengeToken, ... }} the second form when a 6-digit email code is needed
 *   (required by the server for members, by System Settings for admins, or switched on by this person in Settings): no session exists until it is entered.
 */
export async function login({ email, password, expectedRole }) {
  if (typeof email !== 'string' || typeof password !== 'string') throw badRequest('Enter both your email and password.');
  const user = await db.users.findOne({ email: normalizeEmail(email) });
  if (!user) throw new ApiError(401, 'NO_ACCOUNT', 'No account found with that email.');
  if (user.status === 'suspended') throw new ApiError(403, 'SUSPENDED', 'This account has been banned by an admin. Contact the site administrator.');
  if (!user.passwordHash) throw new ApiError(401, 'USE_GOOGLE', 'This account signs in with Google. Choose "Continue with Google" instead.');
  if (!(await verifyPassword(password || '', user.passwordHash))) throw new ApiError(401, 'BAD_PASSWORD', 'Incorrect password.');
  assertPortal(user, expectedRole);
  // Fails closed: if a code is needed but mail cannot be sent, the person is NOT let in without it.
  if (await needsLoginCode(user)) {
    return issueChallenge({ purpose: 'login', email: user.email, userId: user.id, expectedRole });
  }
  await logActivity(user, 'signed in to', 'TaskIT', { scope: 'account', kind: 'access' });
  return { user: privateUser(user), token: await createSession(user.id) };
}

/**
 * Second step of signing in or signing up: the 6-digit code from the email plus the challenge token from step one.
 * Signing up completes here too: the account is created now, with the address already proven, and signed in.
 * @returns {{ user, token }}
 */
export async function verifyEmailCode(input = {}) {
  const challenge = await consumeChallenge(input);
  let user;
  if (challenge.purpose === 'signup') {
    // The address was free when the code was sent; someone may have taken it since (the unique index is the last line of defence).
    if (await db.users.findOne({ email: challenge.email })) throw conflict('An account with this email already exists.', 'email');
    user = await insertAccount({ ...challenge.pending, email: challenge.email });
  } else {
    user = await db.users.get(challenge.userId);
    if (!user) throw new ApiError(401, 'NO_ACCOUNT', 'No account found with that email.');
    if (user.status === 'suspended') throw new ApiError(403, 'SUSPENDED', 'This account has been banned by an admin. Contact the site administrator.');
    assertPortal(user, challenge.expectedRole);
  }
  await logActivity(user, 'signed in to', 'TaskIT', { scope: 'account', kind: 'access' });
  return { user: privateUser(user), token: await createSession(user.id) };
}

/** The Member / Admin tab chosen on the log-in screen must match the account (an admin is never signed in as a member, or vice versa). */
function assertPortal(user, expectedRole) {
  if (expectedRole && user.accountRole !== expectedRole) {
    throw new ApiError(403, 'WRONG_PORTAL', `This account is registered as ${user.accountRole === 'admin' ? 'an admin' : 'a member'}. Switch tabs and try again.`);
  }
}

// ---------------------------------------------------------------- Google sign-in / sign-up

/** Whether the Google button should be shown, and the (public) client id the browser needs to render it. */
export function getGoogleConfig() {
  const clientId = config.GOOGLE_CLIENT_ID || null;
  return { enabled: Boolean(clientId), clientId };
}

/**
 * Signs in with a Google ID token, creating the account on first use ("Continue with Google").
 *
 * The token is verified by the server-side verifier (signature, audience, expiry) before anything else; only
 * the verified identity is trusted, never a name or email sent alongside it.
 *
 *   - Matching is by Google's stable subject id (`sub`), then by verified email. An email already tied to a
 *     DIFFERENT Google account is refused.
 *   - Roles never change here. The Member / Admin tab (`expectedRole`) must match the existing account, so a
 *     member can never become an admin by signing in through the admin portal.
 *   - A NEW admin account needs the admin invite code, exactly like password sign-up. With no account and no
 *     code, the admin portal answers "no admin account" instead of creating anything.
 *   - First link of a password account: the email is proven by Google, but the password may have been set by
 *     someone else (sign-up does not verify email), so the password is switched off and other sessions end.
 *     The person can set a new one in Settings.
 *
 * @returns {{ user, token }}
 */
export async function loginWithGoogle({ credential, expectedRole, inviteCode = '' } = {}) {
  if (typeof credential !== 'string' || !credential || credential.length > 4096) throw badRequest('Google sign-in did not finish. Please try again.');
  if (typeof inviteCode !== 'string') throw badRequest('Invalid input.');
  if (expectedRole !== undefined && !['user', 'admin'].includes(expectedRole)) throw badRequest('Unknown role.');
  const portal = expectedRole === 'admin' ? 'admin' : 'user';

  let identity;
  try {
    identity = await verifyGoogleCredential(credential);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(401, 'BAD_GOOGLE_TOKEN', 'Google sign-in could not be verified. Please try again.');
  }
  const email = normalizeEmail(identity?.email);
  if (typeof identity?.sub !== 'string' || !identity.sub || !EMAIL_RE.test(email)) throw new ApiError(401, 'BAD_GOOGLE_TOKEN', 'Google sign-in could not be verified. Please try again.');
  if (identity.emailVerified !== true) throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Your Google email address is not verified, so it cannot be used to sign in.');

  const findExisting = async () => (await db.users.findOne({ googleId: identity.sub })) || db.users.findOne({ email });
  let user = await findExisting();
  if (!user) {
    if (portal === 'admin') {
      if (!inviteCode.trim()) throw new ApiError(404, 'NO_ACCOUNT', 'No admin account found for this Google account. Create one with the admin invite code.');
      if (inviteCode.trim() !== config.ADMIN_INVITE_CODE) throw forbidden('Invalid admin invite code.');
    }
    try {
      user = await db.users.insert({
        name: (String(identity.name || '').trim() || email.split('@')[0]).slice(0, 100),
        email,
        passwordHash: null,
        googleId: identity.sub,
        accountRole: portal,
        title: portal === 'admin' ? 'Workspace Administrator' : 'Team Member',
        status: 'active',
        prefs: { ...DEFAULT_PREFS },
        avatarUrl: null,
        avatarFileId: null,
        avatarColor: 'brand',
        twoFactor: false,
        tourPending: portal !== 'admin',
        createdAt: nowISO(),
      });
    } catch (e) {
      // Two first-time sign-ins racing: the unique indexes decide, and the loser simply signs in as the winner's account.
      if (!isDuplicateKey(e)) throw e;
      user = await findExisting();
      if (!user) throw conflict('An account with this email already exists.', 'email');
    }
  }

  if (user.status === 'suspended') throw new ApiError(403, 'SUSPENDED', 'This account has been banned by an admin. Contact the site administrator.');
  if (user.googleId && user.googleId !== identity.sub) throw new ApiError(409, 'GOOGLE_MISMATCH', 'This email is already linked to a different Google account.');
  assertPortal(user, portal);

  if (!user.googleId) {
    const hadPassword = Boolean(user.passwordHash);
    try {
      user = await db.users.update(user.id, hadPassword ? { googleId: identity.sub, passwordHash: null } : { googleId: identity.sub });
    } catch (e) {
      if (isDuplicateKey(e)) throw new ApiError(409, 'GOOGLE_MISMATCH', 'That Google account is already linked to another TaskIT account.');
      throw e;
    }
    if (hadPassword) await destroySessionsFor(user.id);
  }

  await logActivity(user, 'signed in to', 'TaskIT', { scope: 'account', kind: 'access' });
  return { user: privateUser(user), token: await createSession(user.id) };
}

export async function logout(ctx, token) {
  const user = ctx?.actorId ? await db.users.get(ctx.actorId) : null;
  if (user) await logActivity(user, 'signed out of', 'TaskIT', { scope: 'account', kind: 'access' });
  await destroySession(token);
}

/**
 * Step 1 of a password reset: emails a 6-digit code to the address on the account. The answer has the same shape
 * whether or not the address has an account (nothing is emailed when it does not), so it cannot be used to find out
 * who is registered. Finish with `resetPassword`.
 */
export async function requestPasswordReset({ email }) {
  if (typeof email !== 'string' || !email.trim()) throw badRequest('Enter the email on your account.', 'email');
  if (!hasMailer()) throw new ApiError(503, 'EMAIL_CODE_UNAVAILABLE', 'Password reset by email is not set up on this server yet. Ask the site administrator.');
  const address = normalizeEmail(email);
  const user = await db.users.findOne({ email: address });
  if (!user || user.status === 'suspended') return decoyChallenge(address);
  return issueChallenge({ purpose: 'reset', email: address, userId: user.id });
}

/**
 * Step 2: the emailed code plus the new password. The password is checked BEFORE the code is spent, so a too-short one
 * does not burn the code. A reset signs the account out everywhere (anyone who had the old password is locked out), and
 * the person then logs in with the new one.
 */
export async function resetPassword({ challengeToken, code, newPassword } = {}) {
  if (typeof newPassword !== 'string' || newPassword.length < 8) throw badRequest('New password must be at least 8 characters.', 'newPassword');
  const challenge = await consumeChallenge({ challengeToken, code }, ['reset']);
  const user = await db.users.get(challenge.userId);
  if (!user || user.status === 'suspended') throw new ApiError(401, 'CODE_EXPIRED', 'That reset has expired. Start again to get a new code.');
  await db.users.update(user.id, { passwordHash: await hashPassword(newPassword) });
  await destroySessionsFor(user.id);
  await logActivity(user, 'reset the password of', 'TaskIT', { scope: 'account', kind: 'access' });
  return { reset: true };
}

// ---------------------------------------------------------------- the signed-in person

export async function getMe(ctx) {
  return privateUser(await requireActor(ctx));
}

const PROFILE_FIELDS = ['name', 'email', 'title', 'avatarFileId', 'avatarColor', 'prefs', 'twoFactor', 'tourPending'];

/** Name, email, title, avatar, notification preferences, two-factor choice, tour flag. */
export async function updateProfile(ctx, patch) {
  const actor = await requireActor(ctx);
  const next = {};
  PROFILE_FIELDS.forEach((k) => { if (patch?.[k] !== undefined) next[k] = patch[k]; });
  if (next.name !== undefined) {
    if (typeof next.name !== 'string' || !next.name.trim()) throw badRequest('Name is required.', 'name');
    next.name = next.name.trim();
  }
  if (next.email !== undefined) {
    if (typeof next.email !== 'string') throw badRequest('Enter a valid email address.', 'email');
    next.email = normalizeEmail(next.email);
    if (!EMAIL_RE.test(next.email)) throw badRequest('Enter a valid email address.', 'email');
    const other = await db.users.findOne({ email: next.email });
    if (other && other.id !== actor.id) throw conflict('Another account already uses this email.', 'email');
  }
  if (next.title !== undefined) next.title = (typeof next.title === 'string' && next.title.trim()) || actor.title;
  if (next.avatarColor !== undefined) next.avatarColor = String(next.avatarColor).slice(0, 20);
  // Only the known preference switches are accepted, and only as booleans.
  if (next.prefs !== undefined) {
    const merged = { ...DEFAULT_PREFS, ...actor.prefs };
    Object.keys(DEFAULT_PREFS).forEach((k) => { if (typeof next.prefs?.[k] === 'boolean') merged[k] = next.prefs[k]; });
    next.prefs = merged;
  }
  if (next.twoFactor !== undefined) {
    next.twoFactor = Boolean(next.twoFactor);
    if (next.twoFactor && !hasMailer()) throw badRequest('Email codes are not available on this server, so two-step sign-in cannot be turned on.', 'twoFactor');
  }
  if (next.tourPending !== undefined) next.tourPending = Boolean(next.tourPending);
  // The avatar is a file the person uploaded: its URL comes from our file record, never from the request.
  if ('avatarFileId' in next) {
    if (next.avatarFileId) {
      const file = await db.files.get(next.avatarFileId);
      if (!file || file.ownerId !== actor.id) throw badRequest('That photo was not found.');
      next.avatarUrl = file.url;
    } else {
      next.avatarFileId = null;
      next.avatarUrl = null;
    }
    if (actor.avatarFileId && actor.avatarFileId !== next.avatarFileId) await releaseFile(actor.avatarFileId);
  }
  try {
    return privateUser(await db.users.update(actor.id, next));
  } catch (e) {
    if (isDuplicateKey(e)) throw conflict('Another account already uses this email.', 'email');
    throw e;
  }
}

export async function changePassword(ctx, { current, next }) {
  const actor = await requireActor(ctx);
  // A Google-only account has no password yet: being signed in is the proof, so it can SET one without a "current" password.
  const hasPassword = Boolean(actor.passwordHash);
  if (typeof next !== 'string' || (hasPassword && typeof current !== 'string')) throw badRequest('Invalid input.');
  if (hasPassword && !(await verifyPassword(current || '', actor.passwordHash))) throw badRequest('Your current password is incorrect.', 'current');
  if (!next || next.length < 8) throw badRequest('New password must be at least 8 characters.', 'next');
  if (hasPassword && next === current) throw badRequest('Choose a password different from your current one.', 'next');
  await db.users.update(actor.id, { passwordHash: await hashPassword(next) });
}

// ---------------------------------------------------------------- site admin: users

const adminCount = () => db.users.count({ accountRole: 'admin' });

export async function setAccountRole(ctx, userId, accountRole) {
  const admin = await requireSiteAdmin(ctx);
  const user = await db.users.get(userId);
  if (!user) throw notFound('Account not found.');
  if (!['user', 'admin'].includes(accountRole)) throw badRequest('Unknown role.');
  if (userId === admin.id) throw forbidden("You can't change your own role.");
  if (user.accountRole === 'admin' && accountRole !== 'admin' && (await adminCount()) <= 1) throw forbidden('At least one admin must remain.');
  await db.users.update(userId, { accountRole, tourPending: accountRole === 'admin' ? false : user.tourPending });
  await logActivity(admin, `changed role to ${accountRole} for`, user.name, { scope: 'account' });
}

export async function setAccountStatus(ctx, userId, status) {
  const admin = await requireSiteAdmin(ctx);
  const user = await db.users.get(userId);
  if (!user) throw notFound('Account not found.');
  if (!['active', 'suspended'].includes(status)) throw badRequest('Unknown status.');
  if (userId === admin.id) throw forbidden("You can't ban your own account.");
  await db.users.update(userId, { status });
  if (status === 'suspended') await destroySessionsFor(userId); // a banned person is signed out everywhere
  await logActivity(admin, status === 'suspended' ? 'banned' : 'reactivated', user.name, { scope: 'account' });
}

/**
 * Deletes an account and everything that depended on it, in one operation: their teams (passed
 * on or disbanded), personal projects/tasks/reminders, team tasks (freed), notifications, avatar.
 */
export async function deleteUser(ctx, userId) {
  const admin = await requireSiteAdmin(ctx);
  const user = await db.users.get(userId);
  if (!user) throw notFound('Account not found.');
  if (userId === admin.id) throw forbidden("You can't delete your own account.");
  if (user.accountRole === 'admin' && (await adminCount()) <= 1) throw forbidden('At least one admin must remain.');
  // Several collections change, so it is one transaction (all or nothing) when the database supports it.
  await transaction(async () => {
    await removeUserFromTeams(userId);
    await removeUserWork(userId); // before the user row goes, so history can still name them
    await db.notifications.removeWhere({ recipientId: userId });
    await releaseFile(user.avatarFileId);
    await db.users.remove(userId);
  });
  await destroySessionsFor(userId);
  await logActivity(admin, 'deleted account', user.name, { scope: 'account' });
}

// ---------------------------------------------------------------- site settings

export async function getSettings(ctx) {
  await requireActor(ctx);
  return await settingsStore.get();
}

export async function updateSettings(ctx, patch) {
  const admin = await requireSiteAdmin(ctx);
  const next = {};
  ['require2fa', 'notifyDeadlines'].forEach((k) => { if (patch?.[k] !== undefined) next[k] = Boolean(patch[k]); });
  // Sign-in fails closed without a code, so requiring codes where none can be emailed would lock every admin out.
  if (next.require2fa && !hasMailer()) throw badRequest('Email codes are not available on this server, so 2FA cannot be required for admins.', 'require2fa');
  if (patch?.sessionTimeout !== undefined) {
    const minutes = Number(patch.sessionTimeout);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 7 * 24 * 60) throw badRequest('Session timeout must be between 5 minutes and 7 days.', 'sessionTimeout');
    next.sessionTimeout = String(minutes);
  }
  const saved = await settingsStore.set(next);
  await logActivity(admin, 'updated system settings', 'System Settings', { scope: 'account' });
  return saved;
}
