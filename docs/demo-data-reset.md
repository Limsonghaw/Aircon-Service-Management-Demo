# Demo data reset

Phase 1 adds a manual GitHub Actions workflow for the dedicated fictional demo project. The current golden seed is an empty shell. **A reset with that shell will clear the demo business data.** Prepare and approve the populated seed before the first live reset.

## What happens during a run

1. The runner checks the exact HTTPS project URL against the allowed project ref. It reads all pages of Supabase Auth users and checks their email addresses. The demo allow-list contains only `demo@gmail.com`, and that account must exist.
2. It expands the [golden seed dates](../scripts/demo-seed/README.md) using the Malaysia business date. The service role calls `public.reset_demo_data`, which checks Auth again and resets the business tables in one transaction. The existing Auth accounts, passwords, and profile rows are preserved. Employee links are reapplied from the seed. Attachment records and activity logs are cleared.
3. The runner lists and deletes objects in the eight demo Storage buckets. Phase 1 leaves the buckets empty.

The database transaction includes the success audit row and re-enabling the business activity triggers. A failed database transaction rolls back the wipe and reseed. Storage runs after the commit, so a Storage error can leave some objects behind. The runner reports a failed run in that case. Avoid concurrent demo edits and uploads during a reset. The database and Storage use separate APIs, so a visitor writing during the cleanup can race with it.

Reverting the code or removing the workflow does not recover old rows or files. Recovery after a successful wipe requires a separate database backup and copies of the Storage objects.

## Prepare the golden seed

Once Song Haw approves the read-only export, follow the [Chinese export guide](demo-golden-export.md). Review the JSON for real personal information, then put the approved rows into `scripts/demo-seed/data.json` in a later PR. Keep UUIDs and links consistent and check the relative dates against the intended dashboard views.

## Verify in isolation

Run the local tests from the repository root.

```bash
node --test --test-isolation=none scripts/**/*.test.mjs
node scripts/demo-seed/test-support/test-postgres.mjs
```

The PostgreSQL harness uses a fresh database on the local Unix socket and drops it on exit. If local sockets are blocked, run it in single-user mode with local PostgreSQL binaries.

```bash
node scripts/demo-seed/test-support/test-postgres.mjs --single-user /usr/lib/postgresql/17/bin
```

For an end-to-end check, use a disposable, isolated Supabase project. Apply the migrations in filename order, create only the demo Auth account, add fictional dirty rows and Storage objects, and use a local copy of the runner with the synthetic fixture in place of its seed. Supply the four environment variables below for the isolated project. Run `node scripts/reset-demo-data.mjs` twice on the same Malaysia date and check row counts, IDs, dates, login, and empty buckets. Then add an unlisted test account and confirm the next run stops before the reset. Keep the working copy of the committed shell empty until the golden export is approved.

## Configure and review a manual run

Song Haw adds these four repository secrets himself in GitHub under **Settings → Secrets and variables → Actions**. Keep their values out of chat, source files, and logs.

- `DEMO_SUPABASE_URL`
- `DEMO_SUPABASE_SERVICE_ROLE_KEY`
- `DEMO_ALLOWED_PROJECT_REF`
- `DEMO_ALLOWED_USER_EMAILS` with the value `demo@gmail.com`

After approval for the first live reset, open **Actions → Reset demo data → Run workflow**. The workflow is manual until Song Haw separately approves the daily schedule. The intended time is 04:00 Malaysia time, which is 20:00 UTC on the previous day.

Open the run's **reset** job log. On success the runner prints the Malaysia business date, eight seed table counts, and deleted object counts by bucket. A red run reports the stage that failed. A database success row in `public.demo_reset_runs` records the source, business date, timestamp, allow-list count, and seed row counts. That audit covers the database reset. Use the Actions job status to confirm the Storage cleanup completed. If Storage failed after commit, resolve the cause before deciding whether to rerun, since a rerun also replaces business edits made since the last reset.

The Storage implementation uses Supabase's documented listing and deletion operations. [List objects](https://supabase.com/docs/reference/javascript/file-buckets-list) · [Delete objects](https://supabase.com/docs/guides/storage/management/delete-objects)
