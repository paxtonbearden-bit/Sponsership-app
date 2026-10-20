-- Sponsorship platform: core schema.
-- Money is always integer cents. Nothing a sponsor paid for is hard-deleted.

create type app_role as enum ('host', 'sponsor', 'admin');
create type org_member_role as enum ('owner', 'admin', 'volunteer');
create type event_status as enum ('draft', 'published', 'completed', 'archived');
create type proof_type as enum ('photo', 'link', 'screenshot');
create type due_stage as enum ('before', 'during', 'after');
create type sponsorship_status as enum ('pending', 'paid', 'refunded');
create type deliverable_status as enum ('pending', 'delivered', 'missed');
create type renewal_status as enum ('none', 'offered', 'purchased', 'declined');
create type import_source as enum ('pdf', 'text');
create type import_status as enum ('pending', 'processing', 'ready', 'failed');

-- Identity ------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table user_roles (
  user_id uuid not null references profiles (id) on delete cascade,
  role app_role not null,
  primary key (user_id, role)
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  type text not null default 'other'
    check (type in ('charity', 'school_booster', 'race', 'festival', 'chamber', 'other')),
  city text,
  county text,
  logo_path text,
  stripe_account_id text unique,
  stripe_charges_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table org_members (
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role org_member_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on org_members (user_id);

-- Selling -------------------------------------------------------------------

create table events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  starts_at timestamptz not null,
  location text,
  city text,
  county text,
  expected_attendance integer check (expected_attendance >= 0),
  audience_description text,
  status event_status not null default 'draft',
  previous_event_id uuid references events (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index events_org_idx on events (org_id);

create table packages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete restrict,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  quantity_available integer check (quantity_available >= 0), -- null = unlimited
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index packages_event_idx on packages (event_id);

create table package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages (id) on delete cascade,
  description text not null,
  proof_type proof_type not null default 'photo',
  due due_stage not null default 'during',
  sort_order integer not null default 0
);
create index package_items_package_idx on package_items (package_id);

-- Buying --------------------------------------------------------------------

create table sponsors (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  logo_path text,
  city text,
  website text,
  created_at timestamptz not null default now()
);

create table sponsor_members (
  sponsor_id uuid not null references sponsors (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  contact_name text,
  contact_email text,
  primary key (sponsor_id, user_id)
);
create index sponsor_members_user_idx on sponsor_members (user_id);

create table sponsorships (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references sponsors (id) on delete restrict,
  package_id uuid not null references packages (id) on delete restrict,
  event_id uuid not null references events (id) on delete restrict, -- set from package by trigger
  amount_cents integer not null check (amount_cents >= 0),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  stripe_payment_intent_id text unique,
  status sponsorship_status not null default 'pending',
  -- unguessable key for the private recap link
  recap_token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  deleted_at timestamptz
);
create index sponsorships_sponsor_idx on sponsorships (sponsor_id);
create index sponsorships_event_idx on sponsorships (event_id);
create index sponsorships_package_idx on sponsorships (package_id);

-- Delivering ----------------------------------------------------------------

-- Snapshot of package_items taken when a sponsorship is paid, so later package
-- edits never change a promise that was already sold.
create table deliverables (
  id uuid primary key default gen_random_uuid(),
  sponsorship_id uuid not null references sponsorships (id) on delete cascade,
  source_item_id uuid references package_items (id) on delete set null,
  description text not null,
  proof_type proof_type not null,
  due due_stage not null,
  status deliverable_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index deliverables_sponsorship_idx on deliverables (sponsorship_id);

create table volunteer_upload_tokens (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  token_hash text not null unique, -- only a hash is stored
  label text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index volunteer_tokens_event_idx on volunteer_upload_tokens (event_id);

create table proofs (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables (id) on delete cascade,
  kind proof_type not null,
  file_path text,
  url text,
  note text,
  uploaded_by uuid references profiles (id) on delete set null,
  uploaded_via_token uuid references volunteer_upload_tokens (id) on delete set null,
  created_at timestamptz not null default now(),
  check (file_path is not null or url is not null)
);
create index proofs_deliverable_idx on proofs (deliverable_id);

-- Recaps and renewal --------------------------------------------------------

create table recaps (
  id uuid primary key default gen_random_uuid(),
  sponsorship_id uuid not null unique references sponsorships (id) on delete cascade,
  generated_at timestamptz not null default now(),
  host_approved_at timestamptz, -- sponsors see nothing until the host approves
  sent_at timestamptz,
  first_viewed_at timestamptz,
  view_count integer not null default 0,
  renewal_status renewal_status not null default 'none'
);

-- Platform ------------------------------------------------------------------

create table platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into platform_settings (key, value) values ('platform_fee_bps', '600');

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles (id) on delete set null,
  impersonated_user_id uuid references profiles (id) on delete set null,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table ai_import_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  created_by uuid references profiles (id) on delete set null,
  source import_source not null,
  source_path text,
  status import_status not null default 'pending',
  raw_result jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index ai_import_jobs_org_idx on ai_import_jobs (org_id);

-- Triggers ------------------------------------------------------------------

-- Every new auth user gets a profile.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- event_id always comes from the package, never from the caller.
create function set_sponsorship_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select event_id into new.event_id from packages where id = new.package_id;
  if new.event_id is null then
    raise exception 'package % does not exist', new.package_id;
  end if;
  return new;
end $$;

create trigger sponsorships_set_event
  before insert or update of package_id on sponsorships
  for each row execute function set_sponsorship_event();

-- When a sponsorship becomes paid, copy the package items into deliverables.
create function create_deliverables_on_paid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid'
     and (tg_op = 'INSERT' or old.status is distinct from 'paid')
     and not exists (select 1 from deliverables where sponsorship_id = new.id) then
    insert into deliverables (sponsorship_id, source_item_id, description, proof_type, due)
    select new.id, i.id, i.description, i.proof_type, i.due
    from package_items i
    where i.package_id = new.package_id
    order by i.sort_order, i.id;
  end if;
  return new;
end $$;

create trigger sponsorships_create_deliverables
  after insert or update of status on sponsorships
  for each row execute function create_deliverables_on_paid();
