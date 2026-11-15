import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { hash, Algorithm } from '@node-rs/argon2';
import { db, query } from '../server/db';
import { encrypt, decrypt } from '../server/crypto';
import { handle } from '../server/app';
import { authenticated, sessionCookie, requireOrigin } from '../server/auth';
import { publicAddress, resolvePublic, type Transport } from '../server/http';
import { runCheck } from '../server/runner';
import { safeCheckError, CheckError } from '../server/errors';
import { configSchema, projectSchema } from '../server/validation';
import { scheduledChecks, weeklySlot, nextExecution, withLease, cleanup } from '../server/checks';
import { saveProject } from '../server/projects';
let directory: string;
let cookie = '';
const origin = 'http://localhost:5173';
const config = configSchema.parse({
  baseUrl: 'https://example.com',
  authPath: '/login',
  keepAlivePath: '/me',
});
const input = (name = 'Portfolio', enabled = true) => ({
  name,
  enabled,
  config,
  username: 'disposable@example.com',
  password: 'not-a-real-password',
  authBody: { audience: 'demo' },
});
const request = (
  path: string,
  method = 'GET',
  body?: unknown,
  session = cookie,
  requestOrigin = origin,
) =>
  new Request(`${origin}/api${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', Origin: requestOrigin }),
      ...(session ? { Cookie: session } : {}),
    },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  });
async function call(
  path: string,
  method = 'GET',
  body?: unknown,
  session = cookie,
  requestOrigin = origin,
) {
  return handle(request(path, method, body, session, requestOrigin));
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'nudge-test-'));
  process.env.DATABASE_URL = `file:${join(directory, 'test.db')}`;
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.APP_ORIGIN = origin;
  process.env.CRON_SECRET = randomBytes(32).toString('hex');
  process.env.ADMIN_PASSWORD_HASH = await hash('correct-admin-password', {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await db().execute('PRAGMA foreign_keys = ON');
  await db().executeMultiple(
    await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'),
  );
});
after(async () => {
  db().close();
  await rm(directory, { recursive: true, force: true });
});

test('AES-GCM uses unique IVs and rejects tampering, swapped projects and wrong keys', () => {
  const secret = { username: 'user', password: 'ultra-secret' };
  const value = encrypt(secret, 'a');
  assert.deepEqual(decrypt(value, 'a'), secret);
  assert.notEqual(value, encrypt(secret, 'a'));
  assert.ok(!value.includes(secret.password));
  assert.throws(() => decrypt(value, 'b'));
  const damaged = JSON.parse(value);
  damaged.tag = Buffer.alloc(16).toString('base64');
  assert.throws(() => decrypt(JSON.stringify(damaged), 'a'));
  const previous = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  assert.throws(() => decrypt(value, 'a'));
  process.env.ENCRYPTION_KEY = previous;
});
test('SSRF rejects private, reserved, metadata, mapped and mixed DNS addresses', async () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.1.1',
    '192.168.1.1',
    '0.0.0.0',
    '100.100.100.200',
    '192.0.2.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '64:ff9b::a00:1',
    '2001:db8::1',
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
  for (const url of [
    'https://127.0.0.1',
    'https://[::1]',
    'https://169.254.169.254',
    'https://localhost',
    'https://service.internal',
    'http://example.com',
    'https://example.com:8443',
    'https://user:pass@example.com',
    'https://example.com.',
  ])
    await assert.rejects(resolvePublic(new URL(url)), CheckError);
  await assert.rejects(
    resolvePublic(new URL('https://example.com'), async () => [
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]),
    CheckError,
  );
  assert.deepEqual(
    await resolvePublic(new URL('https://example.com'), async () => [
      { address: '8.8.8.8', family: 4 },
    ]),
    { address: '8.8.8.8', family: 4 },
  );
});
test('validation rejects escaping endpoints, ambiguous credentials and unexpected fields', () => {
  assert.equal(config.authMethod, 'POST');
  for (const patch of [
    { authPath: '//evil.example' },
    { authPath: '/\\evil.example' },
    { keepAlivePath: 'https://evil.example/me' },
    { baseUrl: 'http://example.com' },
    { baseUrl: 'https://example.com/path' },
    { baseUrl: 'https://user:pass@example.com' },
    { usernameField: 'password' },
    { passwordField: '__proto__' },
    { keepAliveMethod: 'DELETE' },
    { tokenPath: 'data..token' },
  ])
    assert.equal(
      configSchema.safeParse({ ...config, ...patch }).success,
      false,
      JSON.stringify(patch),
    );
  assert.equal(projectSchema.safeParse({ ...input(), unexpected: true }).success, false);
  assert.equal(projectSchema.safeParse({ ...input(), authBody: [] }).success, false);
});
test('bearer checks send configured credentials and extract nested tokens', async () => {
  const calls: Parameters<Transport>[] = [];
  const send: Transport = async (...args) => {
    calls.push(args);
    return calls.length === 1
      ? { status: 200, body: '{"data":{"accessToken":"private-token"}}', cookies: [] }
      : { status: 201, body: '{}', cookies: [] };
  };
  const result = await runCheck(
    {
      ...config,
      usernameField: 'username',
      tokenPath: 'data.accessToken',
      keepAliveMethod: 'POST',
      keepAliveBody: { ping: true },
    },
    {
      username: 'demo',
      password: 'secret',
      authBody: { role: 'disposable', password: 'overridden' },
    },
    send,
  );
  assert.equal(result.success, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0][3]!), {
    role: 'disposable',
    password: 'secret',
    username: 'demo',
  });
  assert.equal(calls[1][2].Authorization, 'Bearer private-token');
  assert.equal(calls[1][3], '{"ping":true}');
  assert.ok(calls[1][4] instanceof AbortSignal);
  assert.ok(!JSON.stringify(result).includes('private-token'));
});
test('cookie checks respect domain, path and expiration', async () => {
  let invocation = 0;
  const send: Transport = async (_url, _method, headers) => {
    if (++invocation === 1)
      return {
        status: 200,
        body: '',
        cookies: [
          'session=correct; Path=/; HttpOnly; Secure',
          'wrong=no; Domain=evil.example; Path=/',
          'restricted=no; Path=/private',
          'expired=no; Max-Age=0; Path=/',
        ],
      };
    assert.equal(headers.Cookie, 'session=correct');
    return { status: 204, body: '', cookies: [] };
  };
  assert.equal((await runCheck({ ...config, authMode: 'cookie' }, input(), send)).success, true);
});
test('failures and redirects never expose response secrets or raw errors', async () => {
  for (const status of [301, 302, 401, 500]) {
    let count = 0;
    const result = await runCheck(config, input(), async () => {
      count++;
      return { status, body: 'PASSWORD=do-not-leak', cookies: ['secret-cookie'] };
    });
    assert.equal(result.success, false);
    assert.equal(count, 1);
    assert.equal(result.error, `Authentication returned HTTP ${status}.`);
  }
  for (const body of ['not JSON secret', '{}', '{"token":"bad\\r\\nheader"}']) {
    const result = await runCheck(config, input(), async () => ({
      status: 200,
      body,
      cookies: [],
    }));
    assert.equal(result.success, false);
    assert.ok(!result.error?.includes('secret'));
  }
  let count = 0;
  const failed = await runCheck(config, input(), async () => ({
    status: ++count === 1 ? 200 : 503,
    body: '{"token":"secret"}',
    cookies: [],
  }));
  assert.equal(failed.error, 'Keep-alive returned HTTP 503.');
  const exception = await runCheck(config, input(), async () => {
    throw new Error('https://user:password@host token=secret');
  });
  assert.equal(exception.error, safeCheckError(new Error('anything')));
  assert.ok(!JSON.stringify(exception).includes('password'));
});
test('authentication protects endpoints, expires sessions and checks CSRF and password rotation', async () => {
  for (const [path, method] of [
    ['/projects', 'GET'],
    ['/projects', 'POST'],
    ['/checks', 'GET'],
    ['/projects/00000000-0000-0000-0000-000000000000/check', 'POST'],
    ['/projects/test', 'POST'],
  ] as const)
    assert.equal((await call(path, method, {}, '')).status, 401);
  assert.deepEqual(await (await call('/auth/session', 'GET', undefined, '')).json(), {
    authenticated: false,
  });
  assert.equal((await call('/auth/login', 'POST', { password: 'wrong' }, '')).status, 401);
  assert.equal(
    (
      await call(
        '/auth/login',
        'POST',
        { password: 'correct-admin-password' },
        '',
        'https://evil.example',
      )
    ).status,
    403,
  );
  const signed = await call('/auth/login', 'POST', { password: 'correct-admin-password' }, '');
  assert.equal(signed.status, 200);
  cookie = signed.headers.get('set-cookie')!.split(';')[0];
  assert.match(signed.headers.get('set-cookie')!, /HttpOnly/);
  assert.match(signed.headers.get('set-cookie')!, /SameSite=Strict/);
  assert.equal(await authenticated(request('/projects')), true);
  assert.equal(await authenticated(request('/projects'), Date.now() + 8 * 86400000), false);
  const previous = process.env.ADMIN_PASSWORD_HASH;
  process.env.ADMIN_PASSWORD_HASH = previous + 'rotated';
  assert.equal(await authenticated(request('/projects')), false);
  process.env.ADMIN_PASSWORD_HASH = previous;
  process.env.VERCEL = '1';
  assert.match(sessionCookie('test'), /Secure/);
  delete process.env.VERCEL;
  assert.equal((await call('/auth/register', 'POST')).status, 404);
  assert.equal((await call('/auth/logout', 'POST')).status, 200);
  assert.equal(await authenticated(request('/projects')), false);
  const second = await call('/auth/login', 'POST', { password: 'correct-admin-password' }, '');
  cookie = second.headers.get('set-cookie')!.split(';')[0];
});
test('CRUD encrypts credentials, omits secrets and preserves passwords during edits', async () => {
  const created = await call('/projects', 'POST', input());
  assert.equal(created.status, 201);
  const project = await created.json();
  assert.ok(project.id);
  assert.equal(project.password, undefined);
  assert.equal(project.username, undefined);
  assert.equal(project.authBody, undefined);
  const stored = (await query('SELECT secrets FROM projects WHERE id = ?', [project.id])).rows[0];
  assert.ok(!String(stored.secrets).includes(input().password));
  assert.ok(!String(stored.secrets).includes(input().username));
  const { username, password, authBody, ...edit } = input('Renamed');
  assert.equal((await call(`/projects/${project.id}`, 'PATCH', edit)).status, 200);
  const changed = (await query('SELECT * FROM projects WHERE id = ?', [project.id])).rows[0];
  assert.equal(changed.name, 'Renamed');
  assert.equal(
    decrypt<{ password: string }>(String(changed.secrets), project.id).password,
    password,
  );
  assert.equal((await call(`/projects/${project.id}`, 'PATCH', { enabled: false })).status, 200);
  assert.equal(
    (await query('SELECT enabled FROM projects WHERE id = ?', [project.id])).rows[0].enabled,
    0,
  );
  assert.equal(
    (
      await call('/projects', 'POST', {
        ...edit,
        config: { ...config, baseUrl: 'http://localhost' },
      })
    ).status,
    400,
  );
  assert.equal((await call('/projects', 'POST', edit)).status, 400);
  const listed = await (await call('/projects')).json();
  assert.equal(listed.projects.length, 1);
  assert.ok(!JSON.stringify(listed).includes(password));
  assert.equal(listed.projects[0].lastCheck, null);
  assert.equal((await call(`/projects/${project.id}`, 'DELETE')).status, 200);
  assert.equal((await query('SELECT id FROM projects')).rows.length, 0);
});
test('manual checks persist sanitized failures and unsaved tests do not write history', async () => {
  const project = await saveProject({
    ...input(),
    config: { ...config, baseUrl: 'https://127.0.0.1' },
  });
  const result = await call(`/projects/${project.id}/check`, 'POST');
  assert.equal(result.status, 200);
  assert.equal((await result.json()).success, false);
  const activity = await (await call('/checks')).json();
  assert.equal(activity.checks.length, 1);
  assert.equal(activity.checks[0].trigger, 'manual');
  assert.equal((await (await call('/projects')).json()).projects[0].lastCheck.success, false);
  const tested = await call('/projects/test', 'POST', {
    id: project.id,
    name: project.name,
    enabled: true,
    config: project.config,
  });
  assert.equal(tested.status, 200);
  assert.equal((await tested.json()).success, false);
  assert.equal((await query('SELECT id FROM checks')).rows.length, 1);
  assert.equal((await call(`/projects/${project.id}`, 'DELETE')).status, 200);
  assert.equal((await query('SELECT id FROM checks')).rows.length, 0);
});
test('leases reject overlap, release after errors and reclaim stale locks', async () => {
  await withLease(async () => {
    await assert.rejects(
      withLease(async () => true),
      { status: 409 },
    );
  });
  await assert.rejects(
    withLease(async () => {
      throw new Error('failure');
    }),
  );
  assert.equal(await withLease(async () => 'available'), 'available');
  await query("INSERT INTO leases(name, owner, expires_at) VALUES ('execution', 'stale', 0)");
  assert.equal(await withLease(async () => 'recovered'), 'recovered');
});
test('cron authorization, disabled projects, duplicate handling and failure isolation', async () => {
  assert.equal((await call('/cron')).status, 401);
  assert.equal(
    (
      await handle(
        new Request(`${origin}/api/cron`, { headers: { Authorization: 'Bearer wrong' } }),
      )
    ).status,
    401,
  );
  await saveProject(input('Healthy'));
  await saveProject(input('Broken'));
  await saveProject(input('Disabled', false));
  const corrupt = await saveProject(input('Unreadable'));
  await query('UPDATE projects SET secrets = ? WHERE id = ?', ['invalid ciphertext', corrupt.id]);
  let count = 0;
  const result = await scheduledChecks(async () => ({
    success: ++count === 1,
    error: count === 1 ? null : 'Authentication returned HTTP 401.',
    durationMs: 8,
  }));
  assert.equal(result.checked, 3);
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 2);
  assert.equal(count, 2);
  assert.equal((await query('SELECT * FROM checks')).rows.length, 3);
  assert.equal((await scheduledChecks()).duplicate, true);
  const authorized = await handle(
    new Request(`${origin}/api/cron`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    }),
  );
  assert.equal(authorized.status, 200);
  assert.equal((await authorized.json()).duplicate, true);
});
test('partial cron runs resume unfinished projects without repeating completed ones', async () => {
  const slot = weeklySlot();
  await query('UPDATE cron_runs SET finished_at = NULL WHERE slot = ?', [slot]);
  const project = await saveProject(input('New connection'));
  let count = 0;
  const result = await scheduledChecks(async () => {
    count++;
    return { success: true, error: null, durationMs: 4 };
  });
  assert.equal(count, 1);
  assert.equal(result.checked, 1);
  assert.equal(
    (await query('SELECT * FROM checks WHERE project_id = ? AND slot = ?', [project.id, slot])).rows
      .length,
    1,
  );
});
test('storage enforces project cap and cleans up expired records', async () => {
  for (let i = Number((await query('SELECT count(*) AS n FROM projects')).rows[0].n); i < 10; i++)
    await saveProject(input(`Project ${i}`));
  await assert.rejects(saveProject(input('Overflow')), { status: 409 });
  const id = String((await query('SELECT id FROM projects LIMIT 1')).rows[0].id);
  await query(
    "INSERT INTO checks(id, project_id, started_at, trigger, success, duration_ms) VALUES ('old', ?, 0, 'manual', 1, 1)",
    [id],
  );
  await query(
    "INSERT INTO sessions(token_hash, expires_at, admin_version) VALUES ('expired', 0, 'old')",
  );
  await cleanup();
  assert.equal((await query("SELECT id FROM checks WHERE id = 'old'")).rows.length, 0);
  assert.equal((await query("SELECT * FROM sessions WHERE token_hash = 'expired'")).rows.length, 0);
});
test('persisted login rate limiting rejects the sixth attempt', async () => {
  await query('DELETE FROM login_limits');
  for (let i = 0; i < 5; i++)
    assert.equal((await call('/auth/login', 'POST', { password: 'wrong' }, '')).status, 401);
  assert.equal(
    (await call('/auth/login', 'POST', { password: 'correct-admin-password' }, '')).status,
    429,
  );
  assert.equal((await query('SELECT attempts FROM login_limits')).rows[0].attempts, 6);
});
test('schedule calculations handle Monday noon and delayed invocations in UTC', () => {
  assert.equal(weeklySlot(new Date('2026-11-16T12:59:00Z')), '2026-11-16T12:00:00.000Z');
  assert.equal(weeklySlot(new Date('2026-11-16T11:59:00Z')), '2026-11-09T12:00:00.000Z');
  assert.equal(nextExecution(new Date('2026-11-15T22:00:00Z')), '2026-11-16T12:00:00.000Z');
  assert.equal(nextExecution(new Date('2026-11-16T12:01:00Z')), '2026-11-23T12:00:00.000Z');
});

test('production origin validation accepts the configured and assigned production domain only', () => {
  const keys = ['APP_ORIGIN', 'VERCEL_ENV', 'VERCEL_PROJECT_PRODUCTION_URL'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.APP_ORIGIN = 'https://nudge-configured.vercel.app';
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'nudge-primary.vercel.app';
    const check = (origin?: string) =>
      requireOrigin(
        new Request('https://nudge-primary.vercel.app/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
        }),
      );
    assert.doesNotThrow(() => check('https://nudge-configured.vercel.app'));
    assert.doesNotThrow(() => check('https://nudge-primary.vercel.app'));
    for (const origin of [
      undefined,
      'null',
      'https://evil.example',
      'https://other-project.vercel.app',
      'https://nudge-primary.vercel.app.evil.example',
      'http://nudge-primary.vercel.app',
      'https://nudge-primary.vercel.app:444',
    ])
      assert.throws(() => check(origin), { status: 403 });
    process.env.VERCEL_ENV = 'preview';
    assert.throws(() => check('https://nudge-primary.vercel.app'), { status: 403 });
    assert.doesNotThrow(() => check('https://nudge-configured.vercel.app'));
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
