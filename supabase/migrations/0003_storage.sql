-- Storage buckets and access rules.
--   logos  : public read. Path: orgs/<org_id>/... or sponsors/<sponsor_id>/...
--   proofs : private.    Path: <event_id>/<deliverable_id>/<file>
-- Sponsors never read the proofs bucket directly; the server hands them
-- short-lived signed links on the recap page.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('logos', 'logos', true, 2097152,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('proofs', 'proofs', false, 10485760,
    array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create policy logos_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos' and (
      ((storage.foldername(name))[1] = 'orgs'
        and is_org_manager(try_uuid((storage.foldername(name))[2])))
      or ((storage.foldername(name))[1] = 'sponsors'
        and is_sponsor_member(try_uuid((storage.foldername(name))[2])))));

create policy logos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'logos' and (
      ((storage.foldername(name))[1] = 'orgs'
        and is_org_manager(try_uuid((storage.foldername(name))[2])))
      or ((storage.foldername(name))[1] = 'sponsors'
        and is_sponsor_member(try_uuid((storage.foldername(name))[2])))));

create policy proofs_read on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and is_event_member(try_uuid((storage.foldername(name))[1])));

create policy proofs_write on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and is_event_member(try_uuid((storage.foldername(name))[1])));
