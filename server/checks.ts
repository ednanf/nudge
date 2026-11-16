import { randomUUID } from 'node:crypto';
import { query } from './db.js';
import { limits } from './config.js';
import { decrypt } from './crypto.js';
import { HttpError } from './errors.js';
import { getProject } from './projects.js';
import { runCheck, type CheckResult } from './runner.js';
import type { ProjectConfig, Secrets } from './validation.js';
export function weeklySlot(now = new Date()): string {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  if (monday.getTime() > now.getTime()) monday.setUTCDate(monday.getUTCDate() - 7);
  return monday.toISOString();
}
export function nextExecution(
  now = new Date(),
  lastCompletedSlot: string | null = null,
  firstProjectAt?: number,
): string {
  // Keep the pending date until cron records completion, even after its delivery window.
  if (lastCompletedSlot)
    return new Date(Date.parse(lastCompletedSlot) + 7 * 86400000).toISOString();
  const anchor = firstProjectAt === undefined ? now : new Date(firstProjectAt);
  const slot = weeklySlot(anchor);
  return new Date(
    Date.parse(slot) + (Date.parse(slot) < anchor.getTime() ? 7 * 86400000 : 0),
  ).toISOString();
}
export async function withLease<T>(work: () => Promise<T>): Promise<T> {
  const owner = randomUUID();
  const now = Date.now();
  const result = await query(
    `INSERT INTO leases(name, owner, expires_at) VALUES ('execution', ?, ?)
 ON CONFLICT(name) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at WHERE leases.expires_at < ?`,
    [owner, now + limits.leaseMs, now],
  );
  if (!result.rowsAffected)
    throw new HttpError(409, 'Another check is running. Try again shortly.');
  try {
    return await work();
  } finally {
    await query("DELETE FROM leases WHERE name = 'execution' AND owner = ?", [owner]);
  }
}
export async function checkProject(
  id: string,
  trigger: 'manual' | 'scheduled',
  slot: string | null = null,
  run = runCheck,
) {
  const project = await getProject(id);
  const started = Date.now();
  let result: CheckResult;
  try {
    result = await run(
      JSON.parse(String(project.config)) as ProjectConfig,
      decrypt<Secrets>(String(project.secrets), id),
    );
  } catch {
    result = {
      success: false,
      error:
        'Stored configuration or credentials could not be read. Verify the encryption key and save the project again.',
      durationMs: Date.now() - started,
    };
  }
  const checkId = randomUUID();
  await query(
    'INSERT INTO checks(id, project_id, started_at, trigger, success, error, duration_ms, slot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [checkId, id, started, trigger, Number(result.success), result.error, result.durationMs, slot],
  );
  return { id: checkId, projectId: id, startedAt: started, trigger, ...result };
}
export async function cleanup() {
  const now = Date.now();
  await query('DELETE FROM checks WHERE started_at < ?', [now - limits.retentionMs]);
  await query('DELETE FROM cron_runs WHERE started_at < ?', [now - limits.retentionMs]);
  await query('DELETE FROM sessions WHERE expires_at <= ?', [now]);
  await query('DELETE FROM login_limits WHERE expires_at <= ?', [now]);
}
export async function scheduledChecks(run = runCheck) {
  return withLease(async () => {
    const slot = weeklySlot();
    const previous = (await query('SELECT finished_at FROM cron_runs WHERE slot = ?', [slot]))
      .rows[0];
    if (previous?.finished_at)
      return { duplicate: true, slot, checked: 0, succeeded: 0, failed: 0 };
    await query('INSERT OR IGNORE INTO cron_runs(slot, started_at) VALUES (?, ?)', [
      slot,
      Date.now(),
    ]);
    const projects = (
      await query(
        `SELECT id FROM projects WHERE enabled = 1 AND id NOT IN (SELECT project_id FROM checks WHERE slot = ?) ORDER BY created_at LIMIT ?`,
        [slot, limits.projects],
      )
    ).rows;
    const results: Awaited<ReturnType<typeof checkProject>>[] = [];
    let next = 0;
    const worker = async () => {
      while (next < projects.length) {
        const project = projects[next++];
        results.push(await checkProject(String(project.id), 'scheduled', slot, run));
      }
    };
    // Ten projects take at most three 90-second waves. Wait for every worker before releasing
    // the cross-invocation lease, even if a database operation fails in one worker.
    const workers = await Promise.allSettled(
      Array.from({ length: Math.min(limits.concurrency, projects.length) }, worker),
    );
    for (const worker of workers) {
      if (worker.status === 'rejected') throw worker.reason;
    }
    await query('UPDATE cron_runs SET finished_at = ? WHERE slot = ?', [Date.now(), slot]);
    await cleanup();
    return {
      duplicate: false,
      slot,
      checked: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };
  });
}
export async function history() {
  const result = await query(
    `SELECT c.*, p.name AS project_name FROM checks c JOIN projects p ON p.id = c.project_id ORDER BY c.started_at DESC, c.id DESC LIMIT 100`,
  );
  return result.rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    projectName: String(r.project_name),
    startedAt: Number(r.started_at),
    trigger: String(r.trigger),
    success: Boolean(r.success),
    error: r.error == null ? null : String(r.error),
    durationMs: Number(r.duration_ms),
  }));
}
