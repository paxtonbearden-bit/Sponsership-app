# Data Model (proposed, awaiting approval)

Decisions locked in:
- Stripe **direct charges** to the host's connected account; platform takes an application fee (default 6%).
- **Host absorbs the fee.** Sponsors pay the quoted package price.
- Renewal: **auto-create a draft event** for next year if none exists; host reviews before it goes live.
- All money is stored as **integer cents**. Fee is stored per sponsorship so later fee changes never rewrite history.
- Soft delete (`deleted_at`) on events, packages, sponsorships. No hard deletes of anything a sponsor paid for.
- RLS enabled on every table from the first migration.

## Changes from the original spec
| Original | Proposed | Why |
|---|---|---|
| `users` with role(s) | `profiles` (1:1 with Supabase `auth.users`) + `user_roles` | Supabase owns auth users; one person can be host and sponsor |
| single owner per org | `org_members` (owner / admin / volunteer) | Hosts have teams; retrofitting later is a painful schema change |
| single sponsor contact | `sponsor_members` | Same reason |
| (none) | `platform_settings` | Configurable fee (starts 600 bps) |
| (none) | `audit_log` | Admin impersonation must be logged |
| (none) | `volunteer_upload_tokens` | No-login upload links, scoped to one event, expiring |
| (none) | `ai_import_jobs` | Track PDF/text extraction and the editable draft |
| `recaps` stores generated page | `recaps` stores send/view/renewal state only | Page reads live data, so host edits never go stale; access via unguessable token |
| print add-ons at checkout in Phase 1 | tables created in Phase 3 | Keeps Phase 1 checkout simple |

## Tables

### Identity
- `profiles` (id = auth.users.id, email, full_name, created_at)
- `user_roles` (user_id, role: host | sponsor | admin)
- `organizations` (id, name, slug, type, city, county, logo_path, stripe_account_id, stripe_charges_enabled, created_at)
- `org_members` (org_id, user_id, role: owner | admin | volunteer)

### Selling
- `events` (id, org_id, slug, name, starts_at, location, city, county, expected_attendance, audience_description, status: draft | published | completed | archived, previous_event_id, deleted_at)
- `packages` (id, event_id, name, price_cents, quantity_available, description, sort_order, deleted_at)
- `package_items` (id, package_id, description, proof_type: photo | link | screenshot, due: before | during | after, sort_order)

### Buying
- `sponsors` (id, business_name, logo_path, city, website)
- `sponsor_members` (sponsor_id, user_id, contact_name, contact_email)
- `sponsorships` (id, sponsor_id, package_id, event_id, amount_cents, platform_fee_cents, stripe_payment_intent_id, status: pending | paid | refunded, recap_token, deleted_at)

### Delivering
- `deliverables` (id, sponsorship_id, source_item_id, description, proof_type, due, status: pending | delivered | missed, snapshot of the package item at purchase time)
- `proofs` (id, deliverable_id, kind: photo | link | screenshot, file_path, url, note, uploaded_by_user_id, uploaded_via_token_id, created_at)
- `volunteer_upload_tokens` (id, event_id, token_hash, expires_at, revoked_at)

### Recaps and renewal
- `recaps` (id, sponsorship_id, generated_at, sent_at, first_viewed_at, view_count, renewal_status: none | offered | purchased | declined, host_approved_at)

### Platform
- `platform_settings` (key, value)
- `audit_log` (id, actor_id, impersonated_user_id, action, detail, created_at)
- `ai_import_jobs` (id, org_id, source: pdf | text, status, raw_result, created_at)

### Phase 3 (created later)
- `print_products`, `print_orders`

## Access rules (RLS summary)
- Hosts: read/write only rows for orgs where they are in `org_members`.
- Sponsors: read only their own sponsorships, deliverables, proofs, recaps.
- Public: only published events, their non-deleted packages and items, and the host's fulfillment score. Never sponsor contact info.
- Recap and volunteer-upload links: served by server code that checks the token. The database never exposes a "list everything" path.
- Admin: reads everything; every impersonation writes to `audit_log`.
- Tests: for every table, a test proves user A cannot read or write user B's data.

## Fulfillment score
`delivered deliverables / (delivered + missed + pending-past-due)` across a host's completed events. Shown publicly only once a host has at least 10 deliverables completed, to avoid misleading scores.
