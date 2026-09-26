# Migrations (Dashboard-first)

Migrations are run **manually, in order, in the Supabase SQL Editor**. No CLI.
Each file (from `20260923000000` on) checks the ledger table and refuses to run twice,
then records itself. The database is the source of truth:

```sql
select version, name, applied_at from private.applied_migrations order by version;
```

| # | File | Phase | Applied in production |
|---|------|-------|-----------------------|
| 1 | `20260922000100_foundation.sql` | 1 | yes (22.09.2026, manually) |
| 2 | `20260923000000_migration_ledger.sql` | 2 | yes (24.09.2026) |
| 3 | `20260923000100_content.sql` | 2 | yes (24.09.2026) |
| 4 | `20260923000200_questions.sql` | 2 | yes (24.09.2026) |
| 5 | `20260924000100_safe_delete.sql` | 2 (שיפורים) | yes (24.09.2026) |
| 6 | `20260924000200_assignments.sql` | 3 | yes (24.09.2026) |
| 7 | `20260925000100_feedback.sql` | 4 | yes (25.09.2026) |
| 8 | `20260925000200_safe_delete_v2.sql` | 4 | yes (25.09.2026) |
| 9 | `20260925000300_feedback_metadata.sql` | 4 | yes (25.09.2026) |
| 10 | `20260926000100_notifications.sql` | 5 | pending |

After running a migration, update this table and the project doc in the same commit.

Rules:
- Never edit a migration that was already applied. Changes = a new file.
- New foreign keys to `courses`, `topics` or `questions` must be `ON DELETE RESTRICT` (decision 25).
- Run each file as one SQL Editor query (paste the whole file, Run). Files use `begin; … commit;`,
  so a failure changes nothing.
