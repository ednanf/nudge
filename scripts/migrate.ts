import { readFile } from 'node:fs/promises';
import { db } from '../server/db';
// This initial migration is idempotent; future changes must get numbered migrations.
await db().execute('PRAGMA foreign_keys = ON');
await db().executeMultiple(
  await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'),
);
db().close();
console.log('Nudge database is ready. A little lift goes a long way.');
