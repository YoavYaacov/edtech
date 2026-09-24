# חוליה — EdTech for a private CS tutor

React (Vite) + Supabase (Postgres, Auth, RLS, Edge Functions). Hebrew RTL UI.
The living project document (architecture, decisions, runbook, phase status) is the source of truth.

## Workflow: Dashboard-first
- **Database**: run files from `supabase/migrations/` manually, in order, in the Supabase SQL Editor.
  See `supabase/migrations/README.md`. Check applied migrations:
  `select * from private.applied_migrations order by version;`
- **Tests**: run `supabase/tests/*.sql` in the SQL Editor. No error = pass. They roll back.
- **Edge Functions**: deploy via Supabase Dashboard → Edge Functions (code from `supabase/functions/`).
- **Frontend**: push to GitHub → Vercel deploys automatically.

## Local development (optional)
```bash
cp .env.example .env.local   # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (anon/publishable key only!)
npm install
npm run dev                  # http://localhost:5173
```

## Rules
- Never put the service_role / secret key in the frontend or in `.env.local`.
- Every schema change = a new migration file. RLS on every table. Never edit an applied migration.
- Archive, don't hard-delete (courses, topics, questions).
- Java code shown to students: Allman braces, `Node<T>`.
