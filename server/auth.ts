import { randomBytes } from 'node:crypto';
import { verify } from '@node-rs/argon2';
import { query } from './db.js';
import { digest } from './crypto.js';
import { appOrigin, appOrigins, required } from './config.js';
import { HttpError } from './errors.js';
const lifetime = 7 * 86400000;
const cookieName = 'nudge_session';
export function sessionToken(request: Request): string {
  return (
    request.headers
      .get('cookie')
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || ''
  );
}
export function sessionCookie(token: string, clear = false): string {
  const secure = process.env.VERCEL || appOrigin().startsWith('https:');
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : lifetime / 1000}${secure ? '; Secure' : ''}`;
}
export async function authenticated(request: Request, now = Date.now()): Promise<boolean> {
  const token = sessionToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const result = await query(
    'SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ? AND admin_version = ?',
    [digest(token), now, digest(required('ADMIN_PASSWORD_HASH'))],
  );
  return result.rows.length > 0;
}
export async function requireAdmin(request: Request) {
  if (!(await authenticated(request))) throw new HttpError(401, 'Please sign in to continue.');
}
export function requireOrigin(request: Request) {
  if (!appOrigins().includes(request.headers.get('origin') || ''))
    throw new HttpError(403, 'Request origin is not allowed.');
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new HttpError(415, 'Use application/json.');
}
export async function login(request: Request, password: string): Promise<string> {
  const now = Date.now();
  // Global persisted limit is deliberate for one administrator: cannot be bypassed with spoofed IP headers.
  const bucket = String(Math.floor(now / 900000));
  const result = await query(
    `INSERT INTO login_limits(bucket, attempts, expires_at) VALUES (?, 1, ?)
 ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1 RETURNING attempts`,
    [bucket, now + 900000],
  );
  if (Number(result.rows[0].attempts) > 5)
    throw new HttpError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
  const encoded = required('ADMIN_PASSWORD_HASH');
  if (!encoded.startsWith('$argon2id$')) throw new Error('Administrator hash must use Argon2id');
  if (!(await verify(encoded, password)))
    throw new HttpError(401, 'Incorrect administrator password.');
  const token = randomBytes(32).toString('hex');
  await query('INSERT INTO sessions(token_hash, expires_at, admin_version) VALUES (?, ?, ?)', [
    digest(token),
    now + lifetime,
    digest(encoded),
  ]);
  const old = sessionToken(request);
  if (old) await query('DELETE FROM sessions WHERE token_hash = ?', [digest(old)]);
  return token;
}
export async function logout(request: Request) {
  await query('DELETE FROM sessions WHERE token_hash = ?', [digest(sessionToken(request))]);
}
