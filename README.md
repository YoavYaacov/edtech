# חוליה — EdTech for a private CS tutor

React (Vite) + Supabase (Postgres, Auth, RLS, Edge Functions). Hebrew RTL UI.
The living project document (architecture, decisions, runbook, phase status) is the source of truth.

## Local development
```bash
cp .env.example .env.local   # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (anon key only!)
npm install
npm run dev                  # http://localhost:5173
```

## Database
```bash
npx supabase login
npx supabase init            # once; creates supabase/config.toml
npx supabase link --project-ref <ref>
npx supabase db push         # applies supabase/migrations/*
```
RLS tests: paste `supabase/tests/phase1_rls_test.sql` into the SQL editor and run. No error = pass. It rolls back.

## Edge Function
```bash
npx supabase secrets set SITE_URL=<app url> ALLOWED_ORIGINS=http://localhost:5173,<app url>
npx supabase functions deploy invite-student
```

## Rules
- Never put the service_role key in the frontend or in `.env.local`.
- Every schema change = a new migration file. RLS on every table.
- Java code shown to students: Allman braces, `Node<T>`.
