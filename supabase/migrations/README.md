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
| 10 | `20260926000100_notifications.sql` | 5 | yes (per project doc) |
| 11 | `20260929000100_ai_runs.sql` | 6 (Round 1A) | yes (29.09.2026, per owner report) |
| 12 | `20260930000100_student_auth_hardening.sql` | Round A | NO - not applied in Production |
| 13 | `20260930000200_course_languages.sql` | Round C1 | NO - not applied in Production |
| 14 | `20260930000300_question_variants.sql` | Round C1 | NO - not applied in Production |
| 15 | `20260930000400_language_resolution.sql` | Round C1 | NO - not applied in Production |

Rows 12-15 must be run in this order, one file per SQL Editor query. Each checks the previous version and refuses to run out of order.
Edge Functions `invite-student` (changed) and `delete-student` (new) must be deployed by hand after row 12-13 (the new invite flow calls
`admin_provision_student` and `admin_find_auth_user`).

After running a migration, update this table and the project doc in the same commit.

Rules:
- Never edit a migration that was already applied. Changes = a new file.
- New foreign keys to `courses`, `topics` or `questions` must be `ON DELETE RESTRICT` (decision 25).
- Run each file as one SQL Editor query (paste the whole file, Run). Files use `begin; … commit;`,
  so a failure changes nothing.
