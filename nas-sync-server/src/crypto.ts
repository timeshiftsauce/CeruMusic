import {randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';

const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;

export const createId = (prefix: string) => `${prefix}_${randomBytes(16).toString('hex')}`;

export const createToken = () => randomBytes(32).toString('base64url');

export const createPairCode = () => randomBytes(9).toString('base64url').toUpperCase();

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const hashPassword = async (password: string) => {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
};

export const verifyPassword = async (password: string, storedHash: string) => {
  const [scheme, salt, hash] = storedHash.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;

  const stored = Buffer.from(hash, 'hex');
  const key = (await scrypt(password, salt, stored.length)) as Buffer;
  return stored.length === key.length && timingSafeEqual(stored, key);
};

export const nowIso = () => new Date().toISOString();