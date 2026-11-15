export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
export const limits = {
  projects: 10,
  requestMs: 75000,
  checkMs: 90000,
  concurrency: 4,
  // Outlive Vercel's 300-second function deadline, including a short cleanup margin.
  leaseMs: 330000,
  retentionMs: 90 * 86400000,
};
export function appOrigin() {
  const url = new URL(required('APP_ORIGIN'));
  if (process.env.VERCEL && url.protocol !== 'https:') throw new Error('APP_ORIGIN must use HTTPS');
  return url.origin;
}

export function appOrigins(): string[] {
  const origins = [appOrigin()];
  // This is Vercel's trusted project-level production domain, not an arbitrary request host.
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origins.push(new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`).origin);
  }
  return origins;
}
