-- Row Level Security. Every table is locked down first, then opened deliberately.
--
-- Rules of the road for future migrations:
--   * every new table must `enable row level security` and get explicit grants
--   * the browser (anon / authenticated) gets only the grants below; anything
--     sensitive (payments, tokens, roles) is written by server code using the
--     service role

-- Helper functions ------------------------------------------------------------
-- SECURITY DEFINER so policies can look across tables without recursing into
-- each other's policies. They return only booleans about the *caller*.

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
$$;

create function is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members where org_id = p_org and user_id = auth.uid())
$$;

create function is_org_manager(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members
    where org_id = p_org and user_id = auth.uid() and role in ('owner', 'admin'))
$$;

create function is_org_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members
    where org_id = p_org and user_id = auth.uid() and role = 'owner')
$$;

create function is_sponsor_member(p_sponsor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sponsor_members where sponsor_id = p_sponsor and user_id = auth.uid())
$$;

create function is_event_member(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e join org_members m on m.org_id = e.org_id
    where e.id = p_event and m.user_id = auth.uid())
$$;

create function is_event_manager(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e join org_members m on m.org_id = e.org_id
    where e.id = p_event and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
$$;

create function event_is_public(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events
    where id = p_event and status in ('published', 'completed') and deleted_at is null)
$$;

create function has_event_sponsorship(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sponsorships s join sponsor_members sm on sm.sponsor_id = s.sponsor_id
    where s.event_id = p_event and sm.user_id = auth.uid() and s.deleted_at is null)
$$;

create function is_package_member(p_package uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from packages p join events e on e.id = p.event_id
    join org_members m on m.org_id = e.org_id
    where p.id = p_package and m.user_id = auth.uid())
$$;

create function is_package_manager(p_package uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from packages p join events e on e.id = p.event_id
    join org_members m on m.org_id = e.org_id
    where p.id = p_package and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
$$;

create function is_package_public(p_package uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from packages p join events e on e.id = p.event_id
    where p.id = p_package and p.deleted_at is null
      and e.status in ('published', 'completed') and e.deleted_at is null)
$$;

create function has_package_sponsorship(p_package uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sponsorships s join sponsor_members sm on sm.sponsor_id = s.sponsor_id
    where s.package_id = p_package and sm.user_id = auth.uid() and s.deleted_at is null)
$$;

create function is_sponsorship_sponsor(p_sponsorship uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sponsorships s join sponsor_members sm on sm.sponsor_id = s.sponsor_id
    where s.id = p_sponsorship and sm.user_id = auth.uid())
$$;

create function is_sponsorship_host_member(p_sponsorship uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sponsorships s join events e on e.id = s.event_id
    join org_members m on m.org_id = e.org_id
    where s.id = p_sponsorship and m.user_id = auth.uid())
$$;

create function is_sponsorship_host_manager(p_sponsorship uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sponsorships s join events e on e.id = s.event_id
    join org_members m on m.org_id = e.org_id
    where s.id = p_sponsorship and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
$$;

create function host_sees_sponsor(p_sponsor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sponsorships s join events e on e.id = s.event_id
    join org_members m on m.org_id = e.org_id
    where s.sponsor_id = p_sponsor and m.user_id = auth.uid() and s.deleted_at is null)
$$;

create function is_deliverable_host_member(p_deliverable uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from deliverables d
    join sponsorships s on s.id = d.sponsorship_id
    join events e on e.id = s.event_id
    join org_members m on m.org_id = e.org_id
    where d.id = p_deliverable and m.user_id = auth.uid())
$$;

create function is_deliverable_host_manager(p_deliverable uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from deliverables d
    join sponsorships s on s.id = d.sponsorship_id
    join events e on e.id = s.event_id
    join org_members m on m.org_id = e.org_id
    where d.id = p_deliverable and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
$$;

-- Sponsors can see proof only after the host has approved the recap.
create function sponsor_can_see_proofs(p_deliverable uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from deliverables d
    join sponsorships s on s.id = d.sponsorship_id
    join sponsor_members sm on sm.sponsor_id = s.sponsor_id
    join recaps r on r.sponsorship_id = s.id
    where d.id = p_deliverable and sm.user_id = auth.uid()
      and r.host_approved_at is not null)
$$;

-- Parse a uuid from text without raising (used by storage policies).
create function try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- Signed-in user creates a host organization and becomes its owner.
-- Roles can't be self-assigned any other way.
create function create_organization(
  p_name text, p_slug text, p_type text default 'other',
  p_city text default null, p_county text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  insert into organizations (name, slug, type, city, county)
  values (p_name, p_slug, p_type, p_city, p_county)
  returning id into v_org;
  insert into org_members (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  insert into user_roles (user_id, role) values (auth.uid(), 'host')
  on conflict do nothing;
  return v_org;
end $$;

-- Lock down function execution: nobody by default, then named roles.
revoke execute on all functions in schema public from public;
grant execute on function
  is_admin(), is_org_member(uuid), is_org_manager(uuid), is_org_owner(uuid),
  is_sponsor_member(uuid), is_event_member(uuid), is_event_manager(uuid),
  event_is_public(uuid), has_event_sponsorship(uuid), is_package_member(uuid),
  is_package_manager(uuid), is_package_public(uuid), has_package_sponsorship(uuid),
  is_sponsorship_sponsor(uuid), is_sponsorship_host_member(uuid),
  is_sponsorship_host_manager(uuid), host_sees_sponsor(uuid),
  is_deliverable_host_member(uuid), is_deliverable_host_manager(uuid),
  sponsor_can_see_proofs(uuid), try_uuid(text)
  to anon, authenticated, service_role;
grant execute on function create_organization(text, text, text, text, text)
  to authenticated, service_role;

-- Enable RLS everywhere --------------------------------------------------------

alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table events enable row level security;
alter table packages enable row level security;
alter table package_items enable row level security;
alter table sponsors enable row level security;
alter table sponsor_members enable row level security;
alter table sponsorships enable row level security;
alter table deliverables enable row level security;
alter table volunteer_upload_tokens enable row level security;
alter table proofs enable row level security;
alter table recaps enable row level security;
alter table platform_settings enable row level security;
alter table audit_log enable row level security;
alter table ai_import_jobs enable row level security;

-- Table privileges: start from nothing ---------------------------------------

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- profiles
grant select on profiles to authenticated;
grant update (full_name) on profiles to authenticated;
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_admin());
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- user_roles (read only; written by create_organization / server)
grant select on user_roles to authenticated;
create policy user_roles_select on user_roles for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- organizations (Stripe columns are never writable from the browser)
grant select on organizations to authenticated;
grant update (name, type, city, county, logo_path) on organizations to authenticated;
create policy organizations_select on organizations for select to authenticated
  using (is_org_member(id) or is_admin());
create policy organizations_update on organizations for update to authenticated
  using (is_org_manager(id)) with check (is_org_manager(id));

-- org_members (only owners manage the team)
grant select, insert, update, delete on org_members to authenticated;
create policy org_members_select on org_members for select to authenticated
  using (is_org_member(org_id) or is_admin());
create policy org_members_insert on org_members for insert to authenticated
  with check (is_org_owner(org_id));
create policy org_members_update on org_members for update to authenticated
  using (is_org_owner(org_id)) with check (is_org_owner(org_id));
create policy org_members_delete on org_members for delete to authenticated
  using (is_org_owner(org_id));

-- events (public can see published/completed; hosts see their own; sponsors see theirs)
grant select on events to anon;
grant select, insert, update on events to authenticated;
create policy events_select_public on events for select to anon, authenticated
  using (status in ('published', 'completed') and deleted_at is null);
create policy events_select_members on events for select to authenticated
  using (is_org_member(org_id) or has_event_sponsorship(id) or is_admin());
create policy events_insert on events for insert to authenticated
  with check (is_org_manager(org_id));
create policy events_update on events for update to authenticated
  using (is_org_manager(org_id)) with check (is_org_manager(org_id));

-- packages
grant select on packages to anon;
grant select, insert, update on packages to authenticated;
create policy packages_select_public on packages for select to anon, authenticated
  using (deleted_at is null and event_is_public(event_id));
create policy packages_select_members on packages for select to authenticated
  using (is_event_member(event_id) or has_event_sponsorship(event_id) or is_admin());
create policy packages_insert on packages for insert to authenticated
  with check (is_event_manager(event_id));
create policy packages_update on packages for update to authenticated
  using (is_event_manager(event_id)) with check (is_event_manager(event_id));

-- package_items
grant select on package_items to anon;
grant select, insert, update, delete on package_items to authenticated;
create policy package_items_select_public on package_items for select to anon, authenticated
  using (is_package_public(package_id));
create policy package_items_select_members on package_items for select to authenticated
  using (is_package_member(package_id) or has_package_sponsorship(package_id) or is_admin());
create policy package_items_insert on package_items for insert to authenticated
  with check (is_package_manager(package_id));
create policy package_items_update on package_items for update to authenticated
  using (is_package_manager(package_id)) with check (is_package_manager(package_id));
create policy package_items_delete on package_items for delete to authenticated
  using (is_package_manager(package_id));

-- sponsors (created by server at checkout)
grant select on sponsors to authenticated;
grant update (business_name, logo_path, city, website) on sponsors to authenticated;
create policy sponsors_select on sponsors for select to authenticated
  using (is_sponsor_member(id) or host_sees_sponsor(id) or is_admin());
create policy sponsors_update on sponsors for update to authenticated
  using (is_sponsor_member(id)) with check (is_sponsor_member(id));

-- sponsor_members (hosts see contacts of their own sponsors)
grant select on sponsor_members to authenticated;
create policy sponsor_members_select on sponsor_members for select to authenticated
  using (user_id = auth.uid() or is_sponsor_member(sponsor_id)
         or host_sees_sponsor(sponsor_id) or is_admin());

-- sponsorships (read only; payments are written by the Stripe webhook)
grant select on sponsorships to authenticated;
create policy sponsorships_select on sponsorships for select to authenticated
  using (is_admin() or (deleted_at is null
         and (is_sponsor_member(sponsor_id) or is_event_member(event_id))));

-- deliverables (hosts confirm status; nobody edits the promise text)
grant select on deliverables to authenticated;
grant update (status) on deliverables to authenticated;
create policy deliverables_select on deliverables for select to authenticated
  using (is_sponsorship_sponsor(sponsorship_id)
         or is_sponsorship_host_member(sponsorship_id) or is_admin());
create policy deliverables_update on deliverables for update to authenticated
  using (is_sponsorship_host_manager(sponsorship_id))
  with check (is_sponsorship_host_manager(sponsorship_id));

-- volunteer_upload_tokens (hosts only; server validates tokens)
grant select, insert, update on volunteer_upload_tokens to authenticated;
create policy volunteer_tokens_select on volunteer_upload_tokens for select to authenticated
  using (is_event_manager(event_id) or is_admin());
create policy volunteer_tokens_insert on volunteer_upload_tokens for insert to authenticated
  with check (is_event_manager(event_id) and created_by = auth.uid());
create policy volunteer_tokens_update on volunteer_upload_tokens for update to authenticated
  using (is_event_manager(event_id)) with check (is_event_manager(event_id));

-- proofs
grant select, insert, update, delete on proofs to authenticated;
create policy proofs_select on proofs for select to authenticated
  using (is_deliverable_host_member(deliverable_id)
         or sponsor_can_see_proofs(deliverable_id) or is_admin());
create policy proofs_insert on proofs for insert to authenticated
  with check (is_deliverable_host_member(deliverable_id)
              and uploaded_by = auth.uid() and uploaded_via_token is null);
create policy proofs_update on proofs for update to authenticated
  using (is_deliverable_host_manager(deliverable_id))
  with check (is_deliverable_host_manager(deliverable_id));
create policy proofs_delete on proofs for delete to authenticated
  using (is_deliverable_host_manager(deliverable_id));

-- recaps (created and tracked by server; host approves)
grant select on recaps to authenticated;
grant update (host_approved_at) on recaps to authenticated;
create policy recaps_select on recaps for select to authenticated
  using (is_sponsorship_host_member(sponsorship_id) or is_admin()
         or (is_sponsorship_sponsor(sponsorship_id) and host_approved_at is not null));
create policy recaps_update on recaps for update to authenticated
  using (is_sponsorship_host_manager(sponsorship_id))
  with check (is_sponsorship_host_manager(sponsorship_id));

-- platform_settings / audit_log (admin only; writes via server)
grant select on platform_settings to authenticated;
create policy platform_settings_select on platform_settings for select to authenticated
  using (is_admin());
grant select on audit_log to authenticated;
create policy audit_log_select on audit_log for select to authenticated
  using (is_admin());

-- ai_import_jobs
grant select, insert on ai_import_jobs to authenticated;
create policy ai_import_jobs_select on ai_import_jobs for select to authenticated
  using (is_org_member(org_id) or is_admin());
create policy ai_import_jobs_insert on ai_import_jobs for insert to authenticated
  with check (is_org_manager(org_id) and created_by = auth.uid());

-- Public views -----------------------------------------------------------------
-- These run with the view owner's rights on purpose: they expose only the
-- fields that are meant to be public.

create view public_organizations as
  select o.id, o.name, o.slug, o.type, o.city, o.county, o.logo_path
  from organizations o
  where exists (
    select 1 from events e
    where e.org_id = o.id and e.status <> 'draft' and e.deleted_at is null);

-- Fulfillment score: delivered / promised, over paid sponsorships on events
-- that have started. Hidden (null) until at least 10 items are in the pool.
create view public_host_scores as
  select
    o.id as org_id,
    count(*) filter (where d.status = 'delivered') as delivered,
    count(*) as promised,
    case when count(*) >= 10
      then round(100.0 * count(*) filter (where d.status = 'delivered') / count(*), 1)
    end as score_percent
  from organizations o
  join events e on e.org_id = o.id
    and e.status in ('published', 'completed') and e.deleted_at is null
    and e.starts_at < now()
  join sponsorships s on s.event_id = e.id and s.status = 'paid' and s.deleted_at is null
  join deliverables d on d.sponsorship_id = s.id
  group by o.id;

grant select on public_organizations, public_host_scores to anon, authenticated;
