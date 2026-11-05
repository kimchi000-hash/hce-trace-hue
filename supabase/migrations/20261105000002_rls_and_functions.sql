-- =====================================================================
-- VoteChain v2 - RLS, quyen cot, ham tien ich, nonce
--
-- DANH TINH VI: dinh danh duy nhat tin cay la claim `app_metadata.wallet` trong JWT.
--   - app_metadata chi service_role (Edge Function wallet-auth) ghi duoc; nguoi dung KHONG sua duoc
--     (khac user_metadata, nguoi dung tu sua duoc -> TUYET DOI khong dung user_metadata cho phan quyen).
--   - Frontend khong the tu gui "wallet_address": moi policy lay dia chi tu JWT, khong tu cot do client gui.
-- RLS KHONG thay the quyen tren hop dong: bang mirror do chain-sync dong bo tu chuoi; neu mirror tre,
--   noi dung van khong the gia mao vi frontend tinh lai hash va so voi chuoi.
-- =====================================================================

-- ---------------------------------------------------------------- Ham dinh danh / vai tro
create or replace function public.auth_wallet() returns text
language sql stable set search_path = '' as $$
  select case
           when (auth.jwt() ->> 'role') = 'authenticated'
            and lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'wallet', '')) ~ '^0x[0-9a-f]{40}$'
           then lower(auth.jwt() -> 'app_metadata' ->> 'wallet')
         end
$$;

-- SECURITY DEFINER de doc bang thanh vien bat chap RLS cua chinh no (tranh de quy policy).
create or replace function public.has_org_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org
      and m.wallet_address = public.auth_wallet()
      and m.membership_status = 'active'
      and m.role = any (p_roles)
  )
$$;

create or replace function public.has_org_role_onchain(p_org_onchain bigint, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organizations o
    join public.organization_members m on m.organization_id = o.id
    where o.organization_id_onchain = p_org_onchain
      and o.verification_status = 'Verified'
      and m.wallet_address = public.auth_wallet()
      and m.membership_status = 'active'
      and m.role = any (p_roles)
  )
$$;

create or replace function public.org_is_verified(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organizations o where o.id = p_org and o.verification_status = 'Verified')
$$;

-- ---------------------------------------------------------------- Han che ban nhap (chong day kho)
-- Chi ap dung cho client (anon / authenticated). service_role / chain-sync KHONG bi han che va KHONG lay khoa.
-- Khoa tu van (advisory lock) theo vi, giu den het giao dich: hai INSERT dong thoi cua cung mot vi duoc xep hang doi,
-- nen lan sau dem thay hang cua lan truoc (READ COMMITTED: moi cau lenh co snapshot moi) -> khong the vuot 200.
-- Trigger BEFORE chay TRUOC kiem tra RLS WITH CHECK, nen o day phai tu chan created_by khac vi dang nhap: neu khong,
-- ke tan cong co the lay khoa / do so luong ban nhap cua vi khac.
create or replace function public.limit_metadata_drafts() returns trigger
language plpgsql set search_path = '' as $$
declare n int;
begin
  if current_user in ('anon', 'authenticated') then
    if new.onchain_seen or new.created_by is distinct from public.auth_wallet() then
      raise exception 'new row violates row-level security policy for table "metadata_history"' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('votechain:draft:' || new.created_by, 0));
    select count(*) into n from public.metadata_history h where h.created_by = new.created_by and not h.onchain_seen;
    if n >= 200 then
      raise exception 'Qua nhieu ban nhap metadata chua ghi len chuoi (toi da 200 moi vi)' using errcode = '54000';
    end if;
  end if;
  return new;
end $$;
create trigger metadata_history_limit before insert on public.metadata_history
  for each row execute function public.limit_metadata_drafts();

-- Hang metadata_history la bat bien voi client: khong sua duoc noi dung / hash / lien ket sau khi gui.
create or replace function public.metadata_history_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'metadata_history chi duoc them hoac xoa ban nhap, khong duoc sua' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger metadata_history_no_update before update on public.metadata_history
  for each row execute function public.metadata_history_immutable();

-- ---------------------------------------------------------------- Nonce dang nhap bang vi (chi service_role)
-- Phat hanh nonce.
--  * Tuan tu hoa theo vi bang advisory lock (xact): nhieu request dong thoi cho cung mot vi KHONG the cung vuot p_max_recent.
--  * KHONG tu choi vi ly do "vi bi spam" (neu tu choi, ke tan cong khoa duoc dang nhap cua vi bat ky chi bang vai request).
--    Moi vi chi giu toi da p_max_recent nonce con hieu luc; nonce cu nhat bi loai.
--  * De ke tan cong khong "day" nonce cua nan nhan ra khoi hang, gioi han theo NGUOI GOI (p_requester = bam IP):
--    moi nguoi goi chi duoc cap toi da p_max_per_requester nonce / phut cho moi vi. Nan nhan o IP khac khong bi anh huong.
--  * Don nonce het han lau (toi da 100 dong/lan, bo qua dong dang bi khoa) de bang khong phinh vo han.
-- Chong replay khong doi: nonce da dung (used_at) van nam trong bang cho den khi het han; nonce bi loai thi khong tieu thu duoc.
create or replace function public.issue_wallet_nonce(p_wallet text, p_nonce text, p_ttl_seconds int, p_max_recent int,
                                                     p_requester text default null, p_max_per_requester int default 5)
returns public.auth_nonces
language plpgsql security definer set search_path = '' as $$
declare r public.auth_nonces; recent int;
begin
  if p_ttl_seconds < 30 or p_ttl_seconds > 900 or p_max_recent < 1 or p_max_recent > 50
     or p_max_per_requester < 1 or p_max_per_requester > 1000 then
    raise exception 'Tham so nonce khong hop le' using errcode = '22023';
  end if;
  -- Thu tu khoa co dinh: vi truoc, nguoi goi sau (tranh deadlock).
  perform pg_advisory_xact_lock(hashtextextended('votechain:nonce:wallet:' || p_wallet, 0));
  if p_requester is not null then
    perform pg_advisory_xact_lock(hashtextextended('votechain:nonce:requester:' || p_requester, 0));
    select count(*) into recent from public.auth_nonces
     where requester = p_requester and wallet_address = p_wallet and issued_at > now() - interval '1 minute';
    if recent >= p_max_per_requester then
      raise exception 'Qua nhieu yeu cau dang nhap, thu lai sau' using errcode = '54000';
    end if;
  end if;
  delete from public.auth_nonces
   where id in (select id from public.auth_nonces where expires_at < now() - interval '1 hour' limit 100 for update skip locked);
  delete from public.auth_nonces
   where id in (select id from public.auth_nonces
                 where wallet_address = p_wallet and used_at is null and expires_at > now()
                 order by issued_at desc offset greatest(p_max_recent - 1, 0));
  insert into public.auth_nonces (wallet_address, nonce, expires_at, requester)
  values (p_wallet, p_nonce, now() + make_interval(secs => p_ttl_seconds), p_requester)
  returning * into r;
  return r;
end $$;

-- Tieu thu nonce: MOT cau lenh UPDATE nguyen tu -> hai request song song khong the cung dung mot nonce (chong replay).
-- Chi thanh cong neu: dung vi, chua dung, chua het han. Tra ve hang (khong co hang = that bai).
create or replace function public.consume_wallet_nonce(p_wallet text, p_nonce text)
returns setof public.auth_nonces
language sql security definer set search_path = '' as $$
  update public.auth_nonces
     set used_at = now()
   where wallet_address = p_wallet and nonce = p_nonce and used_at is null and expires_at > now()
  returning *
$$;

create or replace function public.purge_expired_nonces() returns bigint
language sql security definer set search_path = '' as $$
  with d as (delete from public.auth_nonces where expires_at < now() - interval '1 day' returning 1)
  select count(*) from d
$$;

-- ---------------------------------------------------------------- Quyen bang (nguyen tac: thu hoi het roi cap lai toi thieu)
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all functions in schema public to service_role;

-- Doc cong khai (RLS loc tiep)
grant select on public.organizations, public.organization_approvers, public.elections_chain,
                public.elections_metadata, public.candidates_metadata to anon, authenticated;
grant select on public.organization_members to authenticated;
grant select on public.metadata_history to anon, authenticated;

-- To chuc: Manager chi sua duoc 3 cot mo ta ngoai chuoi; ten, trang thai, chu so huu... la mirror tu chuoi.
grant update (description, logo_url, organization_type) on public.organizations to authenticated;

-- Metadata: nguoi co quyen gui ban nhap va xoa ban nhap cua chinh minh. Khong update.
grant insert (organization_id, metadata_type, candidate_id_onchain, metadata_hash, content, created_by) on public.metadata_history to authenticated;
grant delete on public.metadata_history to authenticated;

-- Ham duoc phep goi tu client (de ghi trong policy) - chi ham doc, khong co tac dung phu
grant execute on function public.auth_wallet() to anon, authenticated;
grant execute on function public.has_org_role(uuid, text[]) to anon, authenticated;
grant execute on function public.has_org_role_onchain(bigint, text[]) to anon, authenticated;
grant execute on function public.org_is_verified(uuid) to anon, authenticated;
-- issue_wallet_nonce / consume_wallet_nonce / purge_expired_nonces: KHONG cap cho anon/authenticated.

-- ---------------------------------------------------------------- RLS
alter table public.organizations          enable row level security;
alter table public.organization_members   enable row level security;
alter table public.organization_approvers enable row level security;
alter table public.elections_chain        enable row level security;
alter table public.elections_metadata     enable row level security;
alter table public.candidates_metadata    enable row level security;
alter table public.metadata_history       enable row level security;
alter table public.auth_nonces            enable row level security;   -- CO Y khong co policy nao: chi service_role (bypass RLS)
alter table public.sync_state             enable row level security;   -- CO Y khong co policy (Security Advisor se nhac: bo qua)

-- organizations: cong khai khi da xac minh hoac dang bi dinh chi (cuoc bau cu cu van can hien thi);
-- to chuc Pending chi thanh vien cua no thay.
create policy organizations_read on public.organizations for select
  using (verification_status in ('Verified', 'Suspended')
         or public.has_org_role(id, array['Member', 'Proposer', 'Manager']));

-- Khop hop dong: updateOrganization la onlyManager => chi khi to chuc dang Verified.
-- Luu y: mo ta/logo la thong tin HIEN THI, khong duoc bao ve boi infoHash tren chuoi (chain-sync khong xac minh).
create policy organizations_manager_update on public.organizations for update to authenticated
  using (verification_status = 'Verified' and public.has_org_role(id, array['Manager']))
  with check (verification_status = 'Verified' and public.has_org_role(id, array['Manager']));

-- thanh vien: chi thanh vien cung to chuc xem duoc danh sach
create policy members_read on public.organization_members for select to authenticated
  using (public.has_org_role(organization_id, array['Member', 'Proposer', 'Manager']));

-- dai dien duyet: cong khai (cung hien thi tren chuoi) nhung chi voi to chuc ma nguoi xem duoc phep thay
create policy approvers_read on public.organization_approvers for select
  using (exists (select 1 from public.organizations o where o.id = organization_id));

-- du lieu cong bo tu chuoi
create policy elections_chain_read    on public.elections_chain     for select using (true);
create policy elections_metadata_read on public.elections_metadata  for select using (true);
create policy candidates_metadata_read on public.candidates_metadata for select using (true);

-- metadata_history: hang da ghi tren chuoi la cong khai; ban nhap chi nguoi gui / Proposer, Manager cua to chuc thay
create policy history_read on public.metadata_history for select
  using (onchain_seen
         or created_by = public.auth_wallet()
         or public.has_org_role(organization_id, array['Proposer', 'Manager']));

create policy history_insert on public.metadata_history for insert to authenticated
  with check (
    created_by = public.auth_wallet()                      -- khong the gui danh nghia vi khac
    and public.auth_wallet() is not null
    and not onchain_seen
    and election_id_onchain is null and metadata_version is null and transaction_hash is null and content_valid is null
    and content is not null
    and public.org_is_verified(organization_id)
    and public.has_org_role(organization_id, array['Proposer', 'Manager'])
  );

create policy history_delete_own_draft on public.metadata_history for delete to authenticated
  using (created_by = public.auth_wallet() and not onchain_seen);
