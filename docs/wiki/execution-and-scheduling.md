# Execution and scheduling

## Fixed weekly schedule

[vercel.json](../../vercel.json) configures one production cron:

```json
{ "path": "/api/cron", "schedule": "0 12 * * 1" }
```

This means Monday at 12:00 UTC, currently 09:00 São Paulo. Displayed execution timestamps use the viewer's local timezone. Exact delivery within the scheduled hour is not important; the objective is occasional MongoDB activity, not continuous uptime monitoring.

Vercel supplies the cron bearer header from `CRON_SECRET`. The route never depends on a signed-in browser. Cron configuration is installed by deployment; merely editing `vercel.json` locally changes nothing in production.

The dashboard's next scheduled check advances only after a scheduled run records `finished_at`. Passing the scheduled time, a missing delivery, an incomplete run or a manual check does not advance it. The pending date can therefore remain in the past. Before any scheduled run exists, the first project's registration anchors the initial Monday; an attempted first run retains its slot until completion. Completed runs can include failed project checks: completion means results were recorded and batch bookkeeping finished, not that every portfolio API was healthy. This display does not trigger retries or change which weekly slot cron processes when it eventually arrives.

Once the displayed date/time arrives, a small **Pending** label appears alongside it until completion advances the date. A signed-in dashboard refreshes every 30 seconds while visible and when the tab becomes visible or the window regains focus. Background refresh pauses while an administrator action is in progress. Refreshing reads status only; it does not invoke checks.

## Cold-start budget

| Boundary                        | Limit                     |
| ------------------------------- | ------------------------- |
| DNS lookup                      | 2.5 seconds per lookup    |
| HTTPS socket inactivity         | 75 seconds                |
| Login plus keep-alive HTTP work | 90-second shared deadline |
| Scheduled pool                  | 4 active checks at most   |
| Registered projects             | 10 at most                |
| Function                        | 300 seconds               |
| Cross-invocation lease          | 330 seconds               |

Render Free can take about a minute to start after receiving a request. A previous 8-second inactivity timeout and 20-second total deadline were too short. The current limits give that cold start room without requiring a paid service.

The total deadline is created before authentication and reused for the keep-alive request. It is not a fresh 90 seconds per request. The HTTP transport also retains its 75-second idle timeout. HTTP work is bounded; database queries and the short DNS resolution wait have their own timing behavior and are not all governed by that abort signal.

For ten projects, four workers imply at most three waves: `ceil(10 / 4) × 90 = 270` seconds of HTTP budget. The remaining approximately 30 seconds are intended for database work and cleanup. This is a planning margin, not a guarantee against arbitrarily slow database calls. Revisit the project cap and concurrency together if changing timeouts.

A timeout becomes a sanitized failed result. Nudge does not automatically retry a request or add warm-up traffic. Failed authentication responses, including a gateway error during cold start, remain failures rather than triggering an implicit POST retry.

## Execution lease

Manual checks, unsaved tests, project deletion and cron runs acquire one database lease named `execution`. A random owner token identifies the holder. The acquire operation atomically inserts the lease or replaces it only if expired.

Another invocation receives HTTP 409 while the lease is held. Release deletes only the matching owner's lease. The lease expiry exceeds Vercel's function deadline so an old invocation cannot still be running when a replacement starts. If a function dies before releasing, the lease becomes reclaimable after 330 seconds.

The lease serializes invocations, not individual workers within one cron invocation. Project configuration writes and schedule toggles do not acquire this lease; disabling a project does not promise cancellation of a check already selected or running.

## Cron worker pool

The handler selects enabled projects without a recorded result for the current slot. Up to four async workers share a next-project cursor. As one finishes, it takes the next project. No process, queue, worker service or external scheduler is provisioned.

Each normal HTTP/authentication/configuration failure is represented as a persisted result, so other projects continue. A database error can reject a worker. The implementation uses `Promise.allSettled` and waits for every worker before releasing the lease, then propagates any worker failure. This avoids unlocking while other requests are still in flight.

The `finished_at` timestamp is set only after successful batch bookkeeping. Cleanup then removes expired records. An infrastructure failure can leave an incomplete cron-run row; a later invocation can resume missing work.

## Weekly slots and duplicate delivery

A slot is the most recent Monday at noon UTC that is not later than the current time. It is represented as an ISO string. This keeps a delayed invocation in the appropriate week until the next slot starts.

Two layers prevent duplicates:

1. A completed `cron_runs` row makes another invocation for that slot a no-op.
2. A unique `(project_id, slot)` constraint prevents duplicate scheduled result rows. An incomplete run selects only projects without a row for that slot.

A failed check is still a recorded result. Re-invoking cron for the same week does not retry recorded failures. Use **Run check** to retry a failed project manually, or wait for the next week.

If a process dies after the portfolio API responded but before the result was written, the next invocation may repeat that operation. Nudge does not claim exactly-once remote execution. Use harmless, repeatable endpoints.

A project added after that week's completed run waits until the next schedule unless checked manually. A project disabled before selection is excluded; a change during a run may take effect only on the following selection.

## Retention and history

Checks and cron runs older than 90 days are removed during cron runs, successful sign-ins and manual checks. Expired sessions and login buckets are cleaned at the same points. An unsaved connection test does not write history or run retention cleanup.

The history API returns the latest 100 records, ordered by start time and then ID descending. Project cards select their latest retained check. If all checks for a project age out, it appears with no retained result.

## Relevant source and provider references

- [server/checks.ts](../../server/checks.ts): lease, workers, slots, history and cleanup.
- [server/runner.ts](../../server/runner.ts): shared check deadline and execution result.
- [server/http.ts](../../server/http.ts): DNS, socket timeout and response cap.
- [Vercel limits](https://vercel.com/docs/functions/limitations).
- [Vercel cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing).
- [Render Free cold starts](https://render.com/docs/free#spinning-down-on-idle).
