import { createClient, type Client, type InArgs } from '@libsql/client';
import { required } from './config.js';
let client: Client | undefined;
export function db(): Client {
  if (!client) {
    const url = required('DATABASE_URL');
    if (process.env.VERCEL && !url.startsWith('libsql://'))
      throw new Error('Production requires a remote Turso database');
    client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  }
  return client;
}
export async function query(sql: string, args: InArgs = []) {
  return db().execute({ sql, args });
}
