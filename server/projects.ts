import { randomUUID } from 'node:crypto';
import type { Row } from '@libsql/client';
import { query } from './db';
import { decrypt, encrypt } from './crypto';
import { limits } from './config';
import { HttpError } from './errors';
import { projectSchema, type ProjectConfig, type Secrets } from './validation';
export function publicProject(row: Row) {
  return {
    id: String(row.id),
    name: String(row.name),
    enabled: Boolean(row.enabled),
    config: JSON.parse(String(row.config)) as ProjectConfig,
    hasPassword: true,
    hasAuthBody: true,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    lastCheck:
      row.last_started_at == null
        ? null
        : {
            startedAt: Number(row.last_started_at),
            success: Boolean(row.last_success),
            error: row.last_error == null ? null : String(row.last_error),
            durationMs: Number(row.last_duration_ms),
          },
  };
}
export async function getProject(id: string) {
  const row = (await query('SELECT * FROM projects WHERE id = ?', [id])).rows[0];
  if (!row) throw new HttpError(404, 'Project not found.');
  return row;
}
export async function listProjects() {
  const result =
    await query(`SELECT p.*, c.started_at AS last_started_at, c.success AS last_success, c.error AS last_error, c.duration_ms AS last_duration_ms
 FROM projects p LEFT JOIN checks c ON c.id = (SELECT id FROM checks WHERE project_id = p.id ORDER BY started_at DESC, id DESC LIMIT 1) ORDER BY p.created_at DESC`);
  return result.rows.map(publicProject);
}
export function parseInput(input: unknown) {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error.issues.map((v) => `${v.path.join('.') || 'Project'}: ${v.message}`).join('; '),
    );
  return parsed.data;
}
export async function prepareProject(input: unknown, id?: string) {
  const data = parseInput(input);
  const existing = id ? await getProject(id) : null;
  const previous = existing ? decrypt<Secrets>(String(existing.secrets), id!) : undefined;
  const secrets: Secrets = {
    username: data.username ?? previous?.username ?? '',
    password: data.password ?? previous?.password ?? '',
    authBody: data.authBody ?? previous?.authBody ?? {},
  };
  if (!secrets.username || !secrets.password)
    throw new HttpError(400, 'Provide the disposable account username and password.');
  return { data, secrets };
}
export async function saveProject(input: unknown, id?: string) {
  const { data, secrets } = await prepareProject(input, id);
  const projectId = id || randomUUID();
  const now = Date.now();
  if (id) {
    await query(
      'UPDATE projects SET name = ?, config = ?, secrets = ?, enabled = ?, updated_at = ? WHERE id = ?',
      [
        data.name,
        JSON.stringify(data.config),
        encrypt(secrets, projectId),
        Number(data.enabled),
        now,
        id,
      ],
    );
  } else {
    const result = await query(
      `INSERT INTO projects(id, name, config, secrets, enabled, created_at, updated_at)
   SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM projects) < ?`,
      [
        projectId,
        data.name,
        JSON.stringify(data.config),
        encrypt(secrets, projectId),
        Number(data.enabled),
        now,
        now,
        limits.projects,
      ],
    );
    if (!result.rowsAffected)
      throw new HttpError(409, `This installation supports at most ${limits.projects} projects.`);
  }
  return publicProject(await getProject(projectId));
}
export type PublicProject = ReturnType<typeof publicProject>;
