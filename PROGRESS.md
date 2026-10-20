# Progress

## Done
- Decisions locked: Stripe direct charges; host absorbs the 6% fee; auto-draft next-year event for renewals.
- Data model and design direction approved (`docs/`).
- **Setup phase complete (needs your testing):**
  - Next.js + TypeScript + Tailwind project with the approved design tokens
  - Supabase schema + Row Level Security on every table (`supabase/migrations/0001-0003`)
  - Storage buckets (`logos` public, `proofs` private) with access rules
  - Magic-link sign-in (`/login`), sign-out, protected `/host` page
  - 31 automated tests; the security tests were also checked by deliberately breaking a rule and confirming they fail

## Not yet verified
- Migrations have been tested on plain Postgres with a stand-in for Supabase's auth/storage pieces, not on a real Supabase project. Applying them to your project (step 2 below) is the first real run.
- Magic-link email delivery (uses Supabase's built-in sender for now; Resend comes later).

## Your setup steps (about 15 minutes)

### 1. Create the Supabase project
supabase.com -> New project. Pick a region near you and save the database password somewhere safe.

### 2. Apply the database
In the project: **SQL Editor -> New query**. Paste and Run each file **in order**, one at a time:
1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_storage.sql`
Each should say "Success". If one shows an error, copy the message to me and stop.

### 3. Allow sign-in links
**Authentication -> URL Configuration**: set Site URL to your Vercel address (step 5), and add `https://YOUR-VERCEL-ADDRESS/auth/callback` and `http://localhost:3000/auth/callback` under Redirect URLs.

### 4. Copy your keys (Project Settings -> API)
- Project URL -> `NEXT_PUBLIC_SUPABASE_URL`
- `anon` `public` key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY` (**secret**: never share or paste in chat)

### 5. Deploy on Vercel
vercel.com -> Add New Project -> import `paxtonbearden-bit/Sponsership-app`. Under Environment Variables add the three keys above plus `NEXT_PUBLIC_SITE_URL` (your Vercel address). Deploy.

## How to test it
1. Open your Vercel address -> **Sign in** -> enter your email.
2. Open the email, click the link. You should land on **Host dashboard** showing "Signed in as <your email>".
3. Click **Sign out**. Then try opening `/host` directly: you should be sent back to the sign-in page.
4. In Supabase **Table Editor -> profiles**, you should see a row for your email.
Anything different? Tell me exactly what you saw.

## Next
Phase 1, feature by feature: host org setup -> events and packages -> AI import -> public package page -> Stripe Connect and checkout -> deliverables -> host dashboard. Seed data (fake charity golf tournament) comes with the first screens.
