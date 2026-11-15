export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
export const limits = {
  projects: 10,
  requestMs: 8000,
  checkMs: 20000,
  leaseMs: 270000,
  retentionMs: 90 * 86400000,
};
export function appOrigin() {
  const url = new URL(required('APP_ORIGIN'));
  if (process.env.VERCEL && url.protocol !== 'https:') throw new Error('APP_ORIGIN must use HTTPS');
  return url.origin;
}
