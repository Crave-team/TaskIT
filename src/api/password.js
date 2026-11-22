/**
 * Password hashing with PBKDF2-SHA256 and a random per-user salt (WebCrypto, which exists in
 * both browsers and Node 18+). Plain-text passwords are never stored or compared. In the real
 * backend, swap for bcrypt/argon2 if you prefer; the `hashPassword` / `verifyPassword`
 * contract stays the same.
 */
const ITERATIONS = 100_000;
const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)));

async function derive(password, salt) {
  const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
}

/** Returns `salt:hash` (hex) ready to store. */
export async function hashPassword(password) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `${toHex(salt)}:${toHex(await derive(password, salt))}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const candidate = toHex(await derive(password, fromHex(saltHex)));
  // Constant-time-ish comparison.
  let diff = candidate.length ^ hashHex.length;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ (hashHex.charCodeAt(i) || 0);
  return diff === 0;
}
