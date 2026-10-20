# Event Sponsorship Platform

Local event hosts sell sponsorship packages, prove delivery, and renew sponsors.
Next.js (App Router) + Supabase + Stripe Connect + Resend, deployed on Vercel.

See `PROGRESS.md` for status and setup steps, `docs/` for the data model and design direction.

## Commands
- `npm run dev` start locally (needs `.env.local`, see `.env.example`)
- `npm test` run the security (RLS) tests and unit tests
- `npm run build` production build

## Security tests
`supabase/tests/rls.test.ts` runs the real migrations against a scratch Postgres and checks
that users cannot read or change each other's data. Point `TEST_DATABASE_URL` at any Postgres
where you are a superuser (default `postgres://postgres@localhost:54329/postgres`). The test
database is dropped and recreated each run.
