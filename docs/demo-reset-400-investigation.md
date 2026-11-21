# Demo reset HTTP 400 investigation

## Finding

Update: Actions run `44872848019` returned SQLSTATE `21000`,
`DELETE requires a WHERE clause`. Loading the official `pg-safeupdate` extension
locally reproduces exactly this error with the original reset function. SQL
Editor success and API-session failure are consistent with a session-specific
safeupdate guard. The secret key format is unrelated to this SQL error.

`202611210001_fix_demo_reset_safeupdate.sql` replaces the reset function with the
same body except that all 15 intentional whole-table DELETE statements have
`WHERE true`. It leaves safeupdate enabled and preserves the Auth gate,
transaction, permissions, trigger handling, and seed. Applying this migration
does not execute a reset. Reverting the function definition does not restore
data/files deleted by a subsequent reset.

The optional local regression mode requires the official `safeupdate` library
installed in PostgreSQL's library directory:

```bash
DEMO_TEST_SAFEUPDATE=1 node scripts/demo-seed/test-support/test-postgres.mjs
```

It reproduces the old failure before applying the new migration, then verifies
two successful real-seed resets with safeupdate enabled. The normal command
continues to work without that optional library. Production verification is
pending the user's manual SQL application and PR merge.

### Initial investigation (before the diagnostic workflow run)

The reported production HTTP 400 has not been reproduced locally. Its exact cause
is still unknown because the old runner discarded the Supabase error body.
No production Supabase requests, secret changes, or workflow reruns were made.
An HTTP status alone cannot identify a failing column or constraint.

## Seed and schema checks

Applied every repository migration in filename order to a fresh local PostgreSQL
18 database, with local Auth/Storage stubs. Expanded the actual `data.json` using
the production `expandSeed` implementation and executed `reset_demo_data` as
`service_role` twice. Both calls returned success with the same business snapshot:
4 teams, 4 employees, 14 customers, 16 quotes, 16 quote items, 17 jobs,
13 invoices, and 5 expenses.

The SQL test additionally rejects every seed key absent from the migrated table's
catalog. Actual inserts check PostgreSQL types, NOT NULL, CHECK, uniqueness, and
foreign keys, including all supplied timestamps, dates, IDs, and amounts.

- Customer types are `individual`/`business` and match the CHECK constraint.
- Job, quote, invoice, and expense statuses match their respective text CHECKs;
  these are not PostgreSQL enums.
- Employee `role` is descriptive text with a length check, distinct from
  `user_profiles.role`. English technician labels are valid.
- Job `team` is length-checked text, not a foreign key to `teams.name`;
  `Team B` is therefore schema-valid even without a matching seeded team.
- Invoice items are JSON arrays using `description`, `quantity`, and `unitPrice`.
  The existing `invoices_calculate_items` trigger remains enabled during reset
  and validates the real seed, calculates amounts, and checks discount rules.
- Quote-item positions, quantities/prices, employee team references, customer
  references, and source-quote references pass the migrated database constraints.

All seven `<table>_record_activity` triggers exist in
`202609300001_create_activity_logs.sql`. All 17 tables touched by the reset's
DELETE/UPDATE/TRUNCATE statements exist after applying the migrations. Tests
assert their existence and that the seven activity triggers start enabled.

## Changes and verification

Failed requests now include only sanitized Supabase `message` and `code` fields.
Keys, bearer tokens, JWTs, and reflected credential-header messages are redacted;
headers, payloads, `details`, `hint`, and raw bodies are not logged. Non-JSON
errors retain the HTTP-only fallback.

The PostgreSQL harness prints local RPC results and uses verbose PostgreSQL
errors (including SQLSTATE) if a query fails. Existing rollback and Auth gates
remain covered. Node tests also cover malformed responses and secret redaction.

## Initial investigation limit

This validates the repository schema, not the live catalog, production ownership,
additional rows/triggers, or PostgREST configuration. No database or seed change
is justified by the available evidence. To identify the production cause, the
sanitized `message`/`code` from an independently authorized subsequent run is
needed. This PR does not run or authorize that reset.
