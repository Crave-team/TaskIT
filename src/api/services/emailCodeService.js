import { db } from '../repo.js';
import { ApiError, badRequest } from '../errors.js';
import { config } from '../config.js';
import { hasMailer, sendMail } from '../mailer.js';

/**
 * Email codes: the second step of signing in (and of signing up).
 *
 * After a correct password the server opens a "challenge": it picks a random 6-digit code, emails it, and hands the
 * browser an opaque CHALLENGE TOKEN. Finishing needs BOTH halves, the token (which only someone who passed the
 * password step has) and the code (which only the owner of the mailbox has), so neither a stolen password nor
 * a peek at someone's inbox is enough on its own.
 *
 *   - Codes come from the crypto random generator, work once, expire after 10 minutes, and allow 5 wrong guesses.
 *   - Only SHA-256 hashes of the token and the code are stored, never the values.
 *   - Re-sending is rate-limited (60 s apart, 5 per attempt) and so is starting attempts for one address (10 / hour).
 *   - Deleting the record is what "uses up" a code, and the delete is atomic, so two requests cannot both succeed.
 */

const enc = new TextEncoder();
const HOUR_MS = 60 * 60 * 1000;

const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (text) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
const iso = (ms) => new Date(ms).toISOString();

function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

/** Uniform 6 digits (rejection sampling avoids the small bias of a plain modulo). */
function randomSixDigits() {
  const limit = 4294967296 - (4294967296 % 1000000);
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return String(buf[0] % 1000000).padStart(6, '0');
}

/** Compares two equal-purpose hex strings without stopping at the first difference. */
function sameHash(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const hashCode = (code, salt, email) => sha256(`${salt}:${email}:${code}`);

/** "maya.lee@gmail.com" -> "m***@gmail.com": enough to recognise the mailbox, not to harvest it. */
export function maskEmail(email) {
  const [name = '', domain = ''] = String(email).split('@');
  return `${name.slice(0, 1)}***@${domain}`;
}

const expiredError = () => new ApiError(401, 'CODE_EXPIRED', 'That sign-in has expired. Go back and sign in again to get a new code.');

function view(token, email) {
  return {
    codeRequired: true,
    challengeToken: token,
    email: maskEmail(email),
    resendIn: config.EMAIL_CODE_RESEND_SECONDS,
    expiresIn: config.EMAIL_CODE_TTL_SECONDS,
  };
}

function messageFor(code, purpose = 'login') {
  const minutes = Math.round(config.EMAIL_CODE_TTL_SECONDS / 60);
  if (purpose === 'reset') {
    return {
      subject: 'Your TaskIT password reset code',
      text: [
        `Your TaskIT password reset code is ${code}`,
        '',
        `It works once and expires in ${minutes} minutes.`,
        'If you did not ask to reset your password, ignore this email: your password has not been changed.',
      ].join('\n'),
    };
  }
  return {
    subject: 'Your TaskIT sign-in code',
    text: [
      `Your TaskIT sign-in code is ${code}`,
      '',
      `It works once and expires in ${minutes} minutes.`,
      'If you did not try to sign in or sign up, ignore this email: nobody can get in without this code.',
    ].join('\n'),
  };
}

/** Public: does this server send codes, and does it insist on them? (The Settings page and the forms read this.) */
export function getEmailCodeConfig() {
  return { required: Boolean(config.EMAIL_CODE_REQUIRED), available: hasMailer() };
}

/**
 * Starts a challenge and emails the first code.
 * `purpose` is 'login' (an existing account, `userId`) or 'signup' (the not-yet-created account in `pending`).
 */
export async function issueChallenge({ purpose, email, userId = null, pending = null, expectedRole = null }) {
  const now = Date.now();
  // Housekeeping: forget attempts older than an hour; the rest count toward this address's hourly cap.
  const mine = await db.authChallenges.find({ email });
  const recent = [];
  for (const c of mine) {
    if (now - Date.parse(c.createdAt) >= HOUR_MS) await db.authChallenges.remove(c.id);
    else recent.push(c);
  }
  if (recent.length >= config.EMAIL_CODE_MAX_PER_HOUR) {
    throw new ApiError(429, 'TOO_MANY_CODES', 'Too many sign-in attempts for this email. Please wait a while and try again.');
  }

  const code = randomSixDigits();
  const salt = randomHex(8);
  const token = randomHex(32);
  const { subject, text } = messageFor(code, purpose);
  await sendMail({ to: email, subject, text }); // nothing is stored (and no limit used up) if the email cannot be sent
  await db.authChallenges.insert({
    tokenHash: await sha256(token),
    purpose,
    email,
    userId,
    pending,
    expectedRole,
    codeHash: await hashCode(code, salt, email),
    codeSalt: salt,
    expiresAt: iso(now + config.EMAIL_CODE_TTL_SECONDS * 1000),
    attempts: 0,
    sends: 1,
    lastSentAt: iso(now),
    createdAt: iso(now),
  });
  return view(token, email);
}

async function findByToken(token) {
  if (typeof token !== 'string' || !token || token.length > 200) return null;
  return db.authChallenges.findOne({ tokenHash: await sha256(token) });
}

/** Sends a fresh code for a challenge that is still open. The old code stops working. */
export async function resendEmailCode({ challengeToken } = {}) {
  const record = await findByToken(challengeToken);
  const now = Date.now();
  if (!record || now - Date.parse(record.createdAt) >= HOUR_MS) throw expiredError();

  const waited = (now - Date.parse(record.lastSentAt)) / 1000;
  if (waited < config.EMAIL_CODE_RESEND_SECONDS) {
    const wait = Math.ceil(config.EMAIL_CODE_RESEND_SECONDS - waited);
    throw new ApiError(429, 'CODE_TOO_SOON', `Please wait ${wait} seconds before asking for another code.`);
  }
  if (record.sends >= config.EMAIL_CODE_MAX_SENDS) {
    throw new ApiError(429, 'TOO_MANY_CODES', 'Too many codes were requested. Go back and sign in again later.');
  }

  const code = randomSixDigits();
  const salt = randomHex(8);
  const { subject, text } = messageFor(code, record.purpose);
  await sendMail({ to: record.email, subject, text });
  await db.authChallenges.update(record.id, {
    codeHash: await hashCode(code, salt, record.email),
    codeSalt: salt,
    expiresAt: iso(now + config.EMAIL_CODE_TTL_SECONDS * 1000),
    attempts: 0,
    sends: record.sends + 1,
    lastSentAt: iso(now),
  });
  return view(challengeToken, record.email);
}

/**
 * What a password-reset request answers for an address that has NO account (or a banned one): the same shape as a real
 * challenge, with a token that is never stored, so it can never be completed. Nothing is emailed. This way the
 * answer does not say whether an address is registered.
 */
export function decoyChallenge(email) {
  return view(randomHex(32), email);
}

/**
 * Checks the code for a challenge and, if right, uses the challenge up and returns it.
 * Throws BAD_CODE (with the attempts left), CODE_LOCKED or CODE_EXPIRED otherwise.
 *
 * `purposes` says which kind of challenge this call may finish. A code emailed for one purpose can never be spent on
 * another: in particular a password-reset code must not be able to sign anyone in (and the other way round).
 */
export async function consumeChallenge({ challengeToken, code } = {}, purposes = ['login', 'signup']) {
  const guess = typeof code === 'string' ? code.trim() : '';
  if (!/^\d{6}$/.test(guess)) throw badRequest('Enter the 6-digit code from your email.', 'code');

  const record = await findByToken(challengeToken);
  if (!record || Date.parse(record.expiresAt) <= Date.now() || !purposes.includes(record.purpose)) throw expiredError();

  const max = config.EMAIL_CODE_MAX_ATTEMPTS;
  const right = sameHash(await hashCode(guess, record.codeSalt, record.email), record.codeHash);
  if (!right) {
    const attempts = record.attempts + 1;
    if (attempts >= max) {
      await db.authChallenges.remove(record.id);
      throw new ApiError(429, 'CODE_LOCKED', 'Too many wrong codes. Go back and sign in again to get a new one.');
    }
    await db.authChallenges.update(record.id, { attempts });
    const left = max - attempts;
    throw new ApiError(401, 'BAD_CODE', `That code is not correct. ${left} ${left === 1 ? 'try' : 'tries'} left.`, 'code');
  }

  // Using the code up is the delete; if someone else deleted it first, this attempt loses.
  const used = await db.authChallenges.remove(record.id);
  if (!used) throw expiredError();
  return record;
}
