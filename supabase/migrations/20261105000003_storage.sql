-- =====================================================================
-- VoteChain v2 - Storage: 3 bucket, chinh sach theo to chuc, ten file = checksum noi dung
--
-- CAU TRUC DUONG DAN (bat buoc, duoc kiem tra trong policy):
--     {organizationId_onchain}/{loai}/{0x + keccak256(noi dung file) 64 hex}.{png|jpg|webp|pdf}
--   organization-assets : {org}/logo/...          (Manager)
--   election-assets     : {org}/cover|document/...  (Proposer, Manager)
--   candidate-assets    : {org}/avatar|document/... (Proposer, Manager)
--
-- BAO VE GHI DE: ten file chua checksum noi dung, khong co policy UPDATE, va client khong duoc upsert,
--   nen khong ai ghi de file cua to chuc khac (khac thu muc), va khong the doi noi dung file cu.
-- LUU Y: policy khong doc duoc noi dung file nen khong tu kiem tra checksum = ten file. Viec do la cua
--   frontend: tai file, tinh keccak256, so voi manifest trong metadata (va so metadata voi hash tren chuoi).
-- Bucket CONG KHAI: chi chua tai lieu da cong bo cua to chuc / cuoc bau cu / ung vien, khong co du lieu cu tri.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('organization-assets', 'organization-assets', true,  2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('election-assets',     'election-assets',     true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']),
  ('candidate-assets',    'candidate-assets',    true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ham kiem tra duong dan + quyen. Co CASE de khong ep kieu (::bigint) khi duong dan khong hop le.
create or replace function public.can_write_asset(p_bucket text, p_name text) returns boolean
language sql stable set search_path = '' as $$
  select case
    when p_bucket = 'organization-assets'
         and p_name ~ '^[1-9][0-9]{0,17}/logo/0x[0-9a-f]{64}\.(png|jpg|webp)$'
      then public.has_org_role_onchain(((string_to_array(p_name, '/'))[1])::bigint, array['Manager'])
    when p_bucket = 'election-assets'
         and p_name ~ '^[1-9][0-9]{0,17}/(cover/0x[0-9a-f]{64}\.(png|jpg|webp)|document/0x[0-9a-f]{64}\.(pdf|png|jpg|webp))$'
      then public.has_org_role_onchain(((string_to_array(p_name, '/'))[1])::bigint, array['Proposer', 'Manager'])
    when p_bucket = 'candidate-assets'
         and p_name ~ '^[1-9][0-9]{0,17}/(avatar/0x[0-9a-f]{64}\.(png|jpg|webp)|document/0x[0-9a-f]{64}\.(pdf|png|jpg|webp))$'
      then public.has_org_role_onchain(((string_to_array(p_name, '/'))[1])::bigint, array['Proposer', 'Manager'])
    else false
  end
$$;
revoke all on function public.can_write_asset(text, text) from public;
grant execute on function public.can_write_asset(text, text) to anon, authenticated, service_role;

-- Doc: ai cung doc / liet ke duoc 3 bucket cong khai
create policy "assets_read_public" on storage.objects for select
  using (bucket_id in ('organization-assets', 'election-assets', 'candidate-assets'));

-- Tai len: dung duong dan + dung quyen cua dung to chuc (da Verified), phai dang nhap bang vi
create policy "assets_insert_org_roles" on storage.objects for insert to authenticated
  with check (public.can_write_asset(bucket_id, name));

-- Xoa: chi chinh nguoi da tai len, va van con quyen
create policy "assets_delete_own" on storage.objects for delete to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub') and public.can_write_asset(bucket_id, name));

-- KHONG co policy UPDATE: khong ghi de, khong doi ten / chuyen thu muc.
