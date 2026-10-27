import { scrypt as scryptCallback, randomBytes, timingSafeEqual, createCipheriv } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const options = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const equal = (a, b) => a.length === b.length && timingSafeEqual(a, b);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), 64, options);
  return `scrypt$${salt}$${key.toString('base64')}`;
}
export async function verifyPassword(password, encoded) {
  const [algorithm, salt, expected] = (encoded || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  return equal(await scrypt(password, Buffer.from(salt, 'base64'), 64, options), Buffer.from(expected, 'base64'));
}
// Firebase's documented SCRYPT variant: scrypt-derived AES-256-CTR key encrypts the signer key.
// Local compatibility only; no Google API calls. A successful login replaces this hash with native scrypt.
export async function verifyLegacyPassword(password, hash, salt, config) {
  if (!config || config.algorithm !== 'SCRYPT' || !hash || !salt) return false;
  const key = await scrypt(password, Buffer.concat([Buffer.from(salt, 'base64'), Buffer.from(config.saltSeparator, 'base64')]), 32,
    { N: 2 ** config.memoryCost, r: config.rounds, p: 1, maxmem: 128 * 1024 * 1024 });
  const cipher = createCipheriv('aes-256-ctr', key, Buffer.alloc(16));
  return equal(Buffer.concat([cipher.update(Buffer.from(config.signerKey, 'base64')), cipher.final()]), Buffer.from(hash, 'base64'));
}
