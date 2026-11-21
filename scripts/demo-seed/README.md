# Demo golden seed

[`data.json`](data.json) contains the reviewed fictional golden export approved by Song Haw: 4 teams, 4 employees, 14 customers, 16 quotes, 16 quote items, 17 jobs, 13 invoices, and 5 expenses (89 rows total). It is no longer an empty shell. The export's UUIDs, links, and relative business dates are preserved; `userProfileLinks` is empty.

Set `version` to `1`. Each business array contains rows with database column names and fixed UUIDs, including IDs referenced by other rows.

| JSON key | PostgreSQL table |
| --- | --- |
| `teams` | `teams` |
| `employees` | `employees` |
| `customers` | `customers` |
| `quotes` | `quotes` |
| `quoteItems` | `quote_items` |
| `jobs` | `jobs` |
| `invoices` | `invoices` |
| `expenses` | `expenses` |

Optional `userProfileLinks` maps a lowercase, trimmed email to a seeded employee UUID. Resetting clears existing employee links and reapplies the entries in this map to existing profiles. Keep `_meta` for context. Business timestamps supplied by the exporter are retained. Without explicit `created_at` and `updated_at`, the loader uses midnight on the Malaysia business date so repeated loads are deterministic.

## Relative dates

The runner resolves dates using `Asia/Kuala_Lumpur` (UTC+8). It expands `jobs.service_date`, `quotes.valid_until`, `invoices.due_date`, and `expenses.expense_date` before sending the seed to PostgreSQL.

| Token | Meaning |
| --- | --- |
| `today` | Malaysia business date |
| `today-5` | Five calendar days earlier |
| `today+3` | Three calendar days later |
| `month-start` | First calendar day of the current month |
| `month-start+2` | Third calendar day of the current month |
| `month-end` | Last calendar day of the current month |

Each anchor accepts a signed day offset. Calendar arithmetic crosses month and year boundaries. Explicit valid `YYYY-MM-DD` values are also accepted. The exporter produces `today` offsets, which preserve dates' ordering relative to the export day. When reviewing a golden export, use month anchors for records that should stay in the current month, such as a completed job shown on the dashboard.

The [synthetic test fixture](test-fixtures/sample-seed.json) exercises these scenarios in local tests. The runner loads `data.json`.
