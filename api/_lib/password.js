/* Password hashing for affiliate logins (scrypt, per-password random salt).

   A password is never stored, only the hash. The parameters are written into the
   stored string, so they can be raised later without invalidating old hashes. */

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const N = 16384;      // CPU/memory cost: about 16 MB and a few tens of milliseconds
const KEYLEN = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  try {
    const [alg, n, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'hex');
    const key = await scrypt(String(password), Buffer.from(salt, 'hex'), expected.length, { N: Number(n), r: 8, p: 1 });
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch (e) {
    return false;
  }
}

/* A hash to compare against when the email does not exist, so that "no such
   account" and "wrong password" take the same time and look the same. */
let decoy;
async function verifyDecoy(password) {
  decoy = decoy || hashPassword(crypto.randomBytes(16).toString('hex'));
  return verifyPassword(password, await decoy);
}

/* A temporary password the admin hands over once. No look-alike characters
   (0/O, 1/l/I), so it survives being read out over WhatsApp. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function tempPassword(length = 12) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

const MIN_LENGTH = 10;

module.exports = { hashPassword, verifyPassword, verifyDecoy, tempPassword, MIN_LENGTH };
