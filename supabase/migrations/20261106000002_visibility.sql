-- Pham vi xem (cong khai / noi bo / han che) cho thong tin cuoc bau cu, ho so ung vien va ket qua.
-- KHONG doi hop dong. Thiet lap nam trong metadata cuoc bau cu (co hash tren chuoi); chain-sync phan chieu sang elections_chain
-- CHI KHI hash noi dung khop. RLS (khong phai giao dien) la noi ep quyen doc noi dung ngoai chuoi.
--
-- Muc bao dam:
--   * Noi dung ngoai chuoi (mo ta, tieu su, anh, tai lieu): ep bang RLS + kho rieng tu (muc nay).
--   * Ket qua: du lieu bo phieu tren chuoi luon cong khai (su kien Revealed, getVotes); pham vi "ket qua" chi dieu khien giao dien.
--
-- Cuoc bau cu cu (noi dung khong co truong `visibility`) giu nguyen hanh vi: cong khai.

alter table public.elections_chain
  add column if not exists info_visibility      text   not null default 'public' check (info_visibility      in ('public', 'internal', 'restricted')),
  add column if not exists candidate_visibility text   not null default 'public' check (candidate_visibility in ('public', 'internal', 'restricted')),
  add column if not exists results_visibility   text   not null default 'public' check (results_visibility   in ('public', 'internal', 'restricted')),
  add column if not exists restricted_roles     text[] not null default '{}' check (restricted_roles <@ array['Manager', 'Proposer']::text[]);

-- Ai duoc xem pham vi p_scope ('info' | 'candidates' | 'results') cua cuoc bau cu p_election.
--   public     : moi nguoi.
--   internal   : thanh vien dang hoat dong cua to chuc so huu cuoc bau cu (dang nhap bang vi).
--   restricted : nguoi tao + dai dien duyet cua to chuc (luon duoc xem, vi phai xem ho so de duyet) + vai tro nguoi tao tich them.
-- Khong tim thay cuoc bau cu => false (khong bao gio mac dinh cho xem).
create or replace function public.can_view_election(p_election bigint, p_scope text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  e record;
  w text := public.auth_wallet();
  v text;
begin
  if p_scope not in ('info', 'candidates', 'results') then return false; end if;
  select c.organization_id, c.proposer_wallet, c.info_visibility, c.candidate_visibility, c.results_visibility, c.restricted_roles
    into e from public.elections_chain c where c.election_id_onchain = p_election;
  if not found then return false; end if;
  v := case p_scope when 'info' then e.info_visibility when 'candidates' then e.candidate_visibility else e.results_visibility end;
  if v = 'public' then return true; end if;
  if w is null then return false; end if;
  if w = e.proposer_wallet then return true; end if;
  if exists (select 1 from public.organization_approvers a
              where a.organization_id = e.organization_id and a.wallet_address = w and a.status = 'active') then
    return true;
  end if;
  if v = 'internal' then
    return exists (select 1 from public.organization_members m
                    where m.organization_id = e.organization_id and m.wallet_address = w and m.membership_status = 'active');
  end if;
  return exists (select 1 from public.organization_members m
                  where m.organization_id = e.organization_id and m.wallet_address = w and m.membership_status = 'active'
                    and m.role = any (e.restricted_roles));
end $$;
revoke all on function public.can_view_election(bigint, text) from public;
grant execute on function public.can_view_election(bigint, text) to anon, authenticated, service_role;

-- Thay chinh sach doc "ai cung doc" bang chinh sach theo pham vi.
drop policy if exists elections_metadata_read on public.elections_metadata;
create policy elections_metadata_read on public.elections_metadata for select
  using (public.can_view_election(election_id_onchain, 'info'));

drop policy if exists candidates_metadata_read on public.candidates_metadata;
create policy candidates_metadata_read on public.candidates_metadata for select
  using (public.can_view_election(election_id_onchain, 'candidates'));

-- Hang nhat ky da ghi len chuoi chua noi dung day du: cung phai theo pham vi. Ban nhap (chua len chuoi) chi nguoi tao
-- va Proposer/Manager cua to chuc moi doc duoc, nhu truoc day.
drop policy if exists history_read on public.metadata_history;
create policy history_read on public.metadata_history for select
  using (
    (onchain_seen and election_id_onchain is not null
       and public.can_view_election(election_id_onchain, case metadata_type when 'election' then 'info' else 'candidates' end))
    or created_by = public.auth_wallet()
    or (not onchain_seen and public.has_org_role(organization_id, array['Proposer', 'Manager']))
  );

-- ---------------------------------------------------------------- Kho rieng tu
-- Ho so khong cong khai tai len bucket *-private (khong public). Doc qua URL ky co han: Storage cap URL ky chi khi chinh sach select cho phep.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('election-private',  'election-private',  false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']),
  ('candidate-private', 'candidate-private', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_write_asset(p_bucket text, p_name text) returns boolean
language sql stable set search_path = '' as $$
  select case
    when p_bucket = 'organization-assets'
         and p_name ~ '^[1-9][0-9]{0,17}/logo/0x[0-9a-f]{64}\.(png|jpg|webp)$'
      then public.has_org_role_onchain(((string_to_array(p_name, '/'))[1])::bigint, array['Manager'])
    when p_bucket in ('election-assets', 'election-private')
         and p_name ~ '^[1-9][0-9]{0,17}/(cover/0x[0-9a-f]{64}\.(png|jpg|webp)|document/0x[0-9a-f]{64}\.(pdf|png|jpg|webp))$'
      then public.has_org_role_onchain(((string_to_array(p_name, '/'))[1])::bigint, array['Proposer', 'Manager'])
    when p_bucket in ('candidate-assets', 'candidate-private')
         and p_name ~ '^[1-9][0-9]{0,17}/(avatar/0x[0-9a-f]{64}\.(png|jpg|webp)|document/0x[0-9a-f]{64}\.(pdf|png|jpg|webp))$'
      then public.has_org_role_onchain(((string_to_array(p_name, '/'))[1])::bigint, array['Proposer', 'Manager'])
    else false
  end
$$;

-- Tep rieng tu chi doc duoc khi co mot hang noi dung THAM CHIEU duong dan do va nguoi doc duoc xem hang do:
--   * hang da len chuoi: theo pham vi cua cuoc bau cu;
--   * ban nhap: nguoi tao hoac Proposer/Manager cua to chuc (de xem truoc khi gui).
-- Duong dan chua hash noi dung tep, khong the doan tu du lieu tren chuoi.
create or replace function public.can_read_private_asset(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_bucket in ('election-private', 'candidate-private')
    and p_name ~ '^[1-9][0-9]{0,17}/(avatar|cover|document)/0x[0-9a-f]{64}\.(png|jpg|webp|pdf)$'
    and exists (
      select 1 from public.metadata_history h
      where h.content is not null
        and strpos(h.content::text, p_bucket || '/' || p_name) > 0
        and (
          (h.onchain_seen and h.election_id_onchain is not null
             and public.can_view_election(h.election_id_onchain, case h.metadata_type when 'election' then 'info' else 'candidates' end))
          or (not h.onchain_seen and (h.created_by = public.auth_wallet() or public.has_org_role(h.organization_id, array['Proposer', 'Manager'])))
        )
    )
$$;
revoke all on function public.can_read_private_asset(text, text) from public;
grant execute on function public.can_read_private_asset(text, text) to anon, authenticated, service_role;

create policy "assets_read_private" on storage.objects for select
  using (bucket_id in ('election-private', 'candidate-private') and public.can_read_private_asset(bucket_id, name));
