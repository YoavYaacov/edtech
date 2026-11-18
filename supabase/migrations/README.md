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
| 12 | `20260930000100_student_auth_hardening.sql` | Round A | yes (per live ledger, verified 17.11.2026) |
| 13 | `20260930000200_course_languages.sql` | Round C1 | yes (per live ledger, verified 17.11.2026) |
| 14 | `20260930000300_question_variants.sql` | Round C1 | yes (per live ledger, verified 17.11.2026) |
| 15 | `20260930000400_language_resolution.sql` | Round C1 | yes (per live ledger, verified 17.11.2026) |
| 16 | `20261001000100_course_sort_order.sql` | Acceptance fixes | yes (per live ledger, verified 17.11.2026) |
| 17 | `20261002000100_ai_variants_and_clone.sql` | Phase 6 final round (C2 + C3) | yes (per live ledger, verified 17.11.2026) |
| 17b | `20261003000100_question_import_core` | PDF question import | yes (07.10.2026, per live ledger). **The .sql file is NOT in this repo** — add it from the original upload |
| 18 | `20261117000100_classes_and_topic_status.sql` | Student screen (batch 1) | yes (applied by owner, verified in ledger) |
| 19 | `20261117000200_delete_class.sql` | Batch 2: delete class (atomic) | NO - not applied (awaiting approval) |
| 20 | `20261117000300_lessons.sql` | Batch 2: lessons engine | NO - not applied (run after row 19) |
| 21 | `20261118000100_join_links_and_identity.sql` | Batch 4: join links, encrypted ID, join approval | NO - not applied (run after row 20; needs Vault + pgcrypto) |
| 22 | `20261118000200_class_board.sql` | Batch 5: class board + comments | NO - not applied (run after row 21) |
| 23 | `20261118000300_class_roster.sql` | Batch 4b: class roster + join by name and ID | NO - not applied (run after row 22) |
| 24 | `20261118000400_pending_join.sql` | Registration fix: server-side pending join bound to the e-mail | Yes (verified in production 2026-11-18) |
| 25 | `20261119000100_teacherapp_sync.sql` | Batch 7: read-only sync of class rosters from TeacherApp (groups -> classes, preview/approve, change notices); roster rows may exist without an ID | NO - not applied (run after row 24) |
| 26 | `20261119000600_teacherapp_id_sync.sql` | Batch 7: full ID sync from TeacherApp (server-side decrypt with the TeacherApp key and re-encrypt with this system's key; kinds id_fill / id_conflict / id_conflict_claimed) + identity backup package (HMAC-signed, restore by stable ids). Needs row 25 AND TeacherApp migration 0009 + Vault secret `teacherapp_identity_key` | NO - not applied (awaiting approval) |

Rows 12-15 are applied in Production (per owner report). Row 16 is new. Rows 12-15 must be run in this order, one file per SQL Editor query. Each checks the previous version and refuses to run out of order.
Edge Functions `invite-student` (changed) and `delete-student` (new) must be deployed by hand after row 12-13 (the new invite flow calls
`admin_provision_student` and `admin_find_auth_user`).

After running a migration, update this table and the project doc in the same commit.

Rules:
- Never edit a migration that was already applied. Changes = a new file.
- New foreign keys to `courses`, `topics` or `questions` must be `ON DELETE RESTRICT` (decision 25).
- Run each file as one SQL Editor query (paste the whole file, Run). Files use `begin; … commit;`,
  so a failure changes nothing.
