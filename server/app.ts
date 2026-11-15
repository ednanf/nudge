import { required } from './config.js';
import { equal } from './crypto.js';
import {
  authenticated,
  login,
  logout,
  requireAdmin,
  requireOrigin,
  sessionCookie,
} from './auth.js';
import { db, query } from './db.js';
import { HttpError } from './errors.js';
import { getProject, listProjects, prepareProject, saveProject } from './projects.js';
import {
  checkProject,
  cleanup,
  history,
  nextExecution,
  scheduledChecks,
  withLease,
} from './checks.js';
import { runCheck } from './runner.js';
async function jsonBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32768) {
      await reader.cancel();
      throw new HttpError(413, 'Request body exceeds 32 KB.');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
export async function handle(request: Request): Promise<Response> {
  try {
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    const method = request.method;
    if (path === '/api/cron') {
      if (method !== 'GET') throw new HttpError(405, 'Method not allowed.');
      const secret = required('CRON_SECRET');
      if (secret.length < 32) throw new Error('CRON_SECRET must contain at least 32 characters');
      if (!equal(request.headers.get('authorization') || '', `Bearer ${secret}`))
        throw new HttpError(401, 'Invalid cron authorization.');
      return json(await scheduledChecks());
    }
    if (!['GET', 'HEAD'].includes(method)) requireOrigin(request);
    if (path === '/api/auth/login' && method === 'POST') {
      const body = (await jsonBody(request)) as { password?: unknown };
      if (
        !body ||
        typeof body.password !== 'string' ||
        !body.password ||
        body.password.length > 1024
      )
        throw new HttpError(400, 'Provide an administrator password (at most 1024 characters).');
      const token = await login(request, body.password);
      await cleanup();
      return json({ authenticated: true }, 200, { 'Set-Cookie': sessionCookie(token) });
    }
    if (path === '/api/auth/session' && method === 'GET')
      return json({ authenticated: await authenticated(request) });
    await requireAdmin(request);
    if (path === '/api/auth/logout' && method === 'POST') {
      await logout(request);
      return json({ authenticated: false }, 200, { 'Set-Cookie': sessionCookie('', true) });
    }
    if (path === '/api/projects' && method === 'GET') {
      const lastRun = (
        await query(
          'SELECT started_at, finished_at FROM cron_runs ORDER BY started_at DESC LIMIT 1',
        )
      ).rows[0];
      return json({
        projects: await listProjects(),
        nextExecution: nextExecution(),
        lastScheduled: lastRun
          ? {
              startedAt: Number(lastRun.started_at),
              finishedAt: lastRun.finished_at == null ? null : Number(lastRun.finished_at),
            }
          : null,
      });
    }
    if (path === '/api/projects' && method === 'POST')
      return json(await saveProject(await jsonBody(request)), 201);
    if (path === '/api/projects/test' && method === 'POST') {
      const body = (await jsonBody(request)) as Record<string, unknown>;
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new HttpError(400, 'Provide a project configuration.');
      const { id, ...input } = body;
      if (id !== undefined && typeof id !== 'string')
        throw new HttpError(400, 'Invalid project identifier.');
      const { data, secrets } = await prepareProject(input, id as string | undefined);
      return json(await withLease(() => runCheck(data.config, secrets)));
    }
    const match = path.match(/^\/api\/projects\/([a-f0-9-]{36})(\/check)?$/);
    if (match) {
      const id = match[1];
      if (match[2] && method === 'POST')
        return json(
          await withLease(async () => {
            const result = await checkProject(id, 'manual');
            await cleanup();
            return result;
          }),
        );
      if (!match[2] && method === 'PATCH') {
        const body = await jsonBody(request);
        if (
          body &&
          typeof body === 'object' &&
          Object.keys(body).length === 1 &&
          'enabled' in body &&
          typeof body.enabled === 'boolean'
        ) {
          await getProject(id);
          await query('UPDATE projects SET enabled = ?, updated_at = ? WHERE id = ?', [
            Number(body.enabled),
            Date.now(),
            id,
          ]);
          return json({ ok: true });
        }
        return json(await saveProject(body, id));
      }
      if (!match[2] && method === 'DELETE')
        return json(
          await withLease(async () => {
            await getProject(id);
            await db().batch(
              [
                { sql: 'DELETE FROM checks WHERE project_id = ?', args: [id] },
                { sql: 'DELETE FROM projects WHERE id = ?', args: [id] },
              ],
              'write',
            );
            return { ok: true };
          }),
        );
    }
    if (path === '/api/checks' && method === 'GET') return json({ checks: await history() });
    throw new HttpError(404, 'Endpoint not found.');
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    // Do not log exception messages or request/response data: they may contain credentials.
    console.error('Nudge request failed (details suppressed to protect secrets).');
    return json(
      {
        error:
          'The server could not complete this request. Check server configuration and database connectivity.',
      },
      500,
    );
  }
}
