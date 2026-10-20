# Progress

## Done
- Repo connected. Design reference repo reviewed.
- Decisions: Stripe direct charges; host absorbs 6% fee; auto-draft next-year event for renewals.
- Proposed data model: docs/DATA_MODEL.md
- Proposed design direction: docs/DESIGN_DIRECTION.md

## Next
1. You review and approve (or change) the data model and design direction.
2. Project setup: Next.js + Tailwind, Supabase schema with RLS, magic-link auth, RLS tests. Then stop for you to test.
3. Phase 1 features, one at a time.

## Accounts and keys needed (not yet)
- Supabase: project URL, anon key, service role key
- Stripe (test mode, Connect enabled): secret key, publishable key, webhook secret
- Resend: API key + sender
- Anthropic: API key (PDF import)
- Vercel: linked to this GitHub repo
Keys go into Vercel / local .env only. Never into chat or the repo.
