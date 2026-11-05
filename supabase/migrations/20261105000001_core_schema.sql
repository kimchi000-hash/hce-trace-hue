-- =====================================================================
-- VoteChain v2 - Giai doan 4: schema off-chain (Supabase / PostgreSQL)
--
-- NGUYEN TAC
--   * Smart contract la nguon su that cho: to chuc, vai tro, dai dien, trang thai, phieu, ket qua, hash metadata.
--   * Cac bang "mirror" (organizations, organization_members, organization_approvers, elections_chain,
--     elections_metadata, candidates_metadata) CHI duoc ghi boi Edge Function chain-sync (service_role),
--     sau khi doc lai tu hop dong. Client (anon / authenticated) chi doc.
--   * Noi dung metadata (mo ta, tieu su...) do nguoi co quyen gui vao metadata_history; chi duoc "thang cap"
--     thanh du lieu hien hanh khi hash tinh lai TU NOI DUNG trung voi hash tren chuoi (chain-sync kiem tra).
--   * Khong bang nao luu thong tin hay lua chon cua tung cu tri.
-- =====================================================================

-- ---------------------------------------------------------------- Kieu du lieu
create domain public.wallet_address as text
  check (value ~ '^0x[0-9a-f]{40}$');                 -- luon viet thuong
create domain public.bytes32_hex as text
  check (value ~ '^0x[0-9a-f]{64}$');                 -- luon viet thuong

-- ---------------------------------------------------------------- Tien ich
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ================================================================= 1. organizations
create table public.organizations (
  id                       uuid primary key default gen_random_uuid(),
  organization_id_onchain  bigint not null unique check (organization_id_onchain > 0),
  name                     text not null check (char_length(name) between 1 and 64),   -- mirror tu chuoi
  description              text check (description is null or char_length(description) <= 2000),
  logo_url                 text check (logo_url is null or logo_url ~ '^https://[^[:space:]]+$'),
  organization_type        text check (organization_type in ('university','faculty','class','club','student_union','community','other')),
  verification_status      text not null check (verification_status in ('Pending','Verified','Suspended')), -- mirror
  created_by               public.wallet_address not null,                                                  -- mirror: chu so huu tren chuoi
  info_hash                public.bytes32_hex,                                                              -- mirror
  chain_created_at         timestamptz,
  synced_at                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index organizations_status_idx on public.organizations (verification_status);
create trigger organizations_updated before update on public.organizations
  for each row execute function public.set_updated_at();

-- ================================================================= 2. organization_members (mirror)
create table public.organization_members (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  wallet_address    public.wallet_address not null,
  role              text not null check (role in ('Member','Proposer','Manager')),
  membership_status text not null default 'active' check (membership_status in ('active','removed')),
  created_at        timestamptz not null default now(),
  unique (organization_id, wallet_address)            -- khong co thanh vien trung vi trong mot to chuc
);
create index organization_members_wallet_idx on public.organization_members (wallet_address) where membership_status = 'active';

-- ================================================================= 3. organization_approvers (mirror)
create table public.organization_approvers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  wallet_address  public.wallet_address not null,
  status          text not null default 'active' check (status in ('active','removed')),
  created_at      timestamptz not null default now(),
  unique (organization_id, wallet_address)
);

-- ================================================================= 4a. elections_chain (mirror trang thai tren chuoi)
create table public.elections_chain (
  election_id_onchain     bigint primary key check (election_id_onchain >= 0),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  proposer_wallet         public.wallet_address not null,
  created_at_chain        timestamptz not null,
  reg_end                 timestamptz not null,
  commit_end              timestamptz not null,
  reveal_end              timestamptz not null,
  request_status          text not null check (request_status in ('Pending','Approved','Rejected','Withdrawn','Expired')),
  candidate_count         int not null check (candidate_count between 2 and 20),
  metadata_hash           public.bytes32_hex not null,       -- hash HIEN HANH tren chuoi
  metadata_version        int not null check (metadata_version >= 1),
  synced_at               timestamptz not null default now()
);
create index elections_chain_org_idx on public.elections_chain (organization_id);
create index elections_chain_proposer_idx on public.elections_chain (proposer_wallet);

-- ================================================================= 4b. elections_metadata (noi dung hien hanh, da kiem hash)
create table public.elections_metadata (
  id                   uuid primary key default gen_random_uuid(),
  election_id_onchain  bigint not null unique references public.elections_chain(election_id_onchain) on delete cascade,
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  title                text,
  description          text,
  cover_image_url      text check (cover_image_url is null or cover_image_url ~ '^https://[^[:space:]]+$'),
  election_metadata    jsonb,                                  -- toan bo metadata chuan hoa (null khi chua co noi dung)
  metadata_hash        public.bytes32_hex not null,            -- hash tren chuoi ma noi dung nay dap ung
  metadata_version     int not null check (metadata_version >= 1),
  status               text not null check (status in ('awaiting_content','verified')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index elections_metadata_org_idx on public.elections_metadata (organization_id);
create trigger elections_metadata_updated before update on public.elections_metadata
  for each row execute function public.set_updated_at();

-- ================================================================= 5. candidates_metadata
create table public.candidates_metadata (
  id                    uuid primary key default gen_random_uuid(),
  election_id_onchain   bigint not null references public.elections_chain(election_id_onchain) on delete cascade,
  candidate_id_onchain  int not null check (candidate_id_onchain between 0 and 19),
  onchain_name          text not null,                        -- ten luu tren hop dong
  full_name             text,
  name_matches_chain    boolean,                              -- ten trong ho so co khop ten tren chuoi khong
  avatar_url            text check (avatar_url is null or avatar_url ~ '^https://[^[:space:]]+$'),
  biography             text,
  experience            text,
  achievements          text,
  manifesto             text,
  documents             jsonb not null default '[]'::jsonb,
  metadata_hash         public.bytes32_hex not null,
  metadata_version      int not null check (metadata_version >= 1),
  status                text not null check (status in ('awaiting_content','verified')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (election_id_onchain, candidate_id_onchain)           -- khong trung candidate trong mot cuoc bau cu
);
create trigger candidates_metadata_updated before update on public.candidates_metadata
  for each row execute function public.set_updated_at();

-- ================================================================= 6. metadata_history
-- Kho noi dung theo hash (client gui len TRUOC khi ghi hash len chuoi) + nhat ky phien ban doc tu su kien.
create table public.metadata_history (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  election_id_onchain  bigint references public.elections_chain(election_id_onchain) on delete cascade,
  candidate_id_onchain int check (candidate_id_onchain is null or candidate_id_onchain between 0 and 19),
  metadata_type        text not null check (metadata_type in ('election','candidate')),
  metadata_hash        public.bytes32_hex not null,
  metadata_version     int check (metadata_version is null or metadata_version >= 1),
  content              jsonb check (content is null or octet_length(content::text) <= 65536),
  content_valid        boolean,                                -- chain-sync tinh lai hash tu content: khop hay khong
  transaction_hash     public.bytes32_hex,
  onchain_seen         boolean not null default false,         -- hash nay da duoc ghi tren chuoi
  created_by           public.wallet_address,
  created_at           timestamptz not null default now(),
  -- ung vien <=> co candidate_id; cuoc bau cu <=> khong co. Ap dung cho CA ban nhap lan hang su kien.
  constraint metadata_history_candidate_id_shape check ((metadata_type = 'candidate') = (candidate_id_onchain is not null)),
  check (content is not null or onchain_seen)                  -- hang khong co noi dung chi hop le khi la nhat ky su kien
);
-- Hai loai hang tach biet:
--   * BAN NHAP (onchain_seen = false): nguoi co quyen gui noi dung len truoc khi ghi hash len chuoi. Rieng theo nguoi gui,
--     nen nguoi la KHONG the "chiem" hash cua nguoi khac de chan ho gui noi dung that.
--   * HANG SU KIEN (onchain_seen = true): chain-sync tao tu su kien ElectionMetadataSet / CandidateMetadataSet, moi phien ban
--     mot hang, kem noi dung chi khi hash tinh lai tu noi dung KHOP hash tren chuoi.
alter table public.metadata_history
  add constraint metadata_history_event_shape
  check (not onchain_seen or (election_id_onchain is not null and metadata_version is not null and transaction_hash is not null));
create unique index metadata_history_draft_uq on public.metadata_history (metadata_type, metadata_hash, created_by, (coalesce(candidate_id_onchain, -1))) where not onchain_seen;
create unique index metadata_history_event_uq on public.metadata_history (metadata_type, election_id_onchain, (coalesce(candidate_id_onchain, -1)), metadata_version) where onchain_seen;
create index metadata_history_election_idx on public.metadata_history (election_id_onchain, metadata_type, candidate_id_onchain, metadata_version);
create index metadata_history_creator_idx on public.metadata_history (created_by);

-- ================================================================= 7. Van hanh: nonce + trang thai dong bo
create table public.auth_nonces (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  public.wallet_address not null,
  nonce           text not null unique check (nonce ~ '^[0-9a-f]{32}$'),
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz not null,
  used_at         timestamptz,
  requester       text check (requester is null or requester ~ '^[0-9a-f]{16,64}$')   -- bam (hash) cua IP nguoi goi, de gioi han theo NGUOI GOI thay vi theo vi muc tieu
);
create index auth_nonces_wallet_idx on public.auth_nonces (wallet_address, issued_at desc);
create index auth_nonces_requester_idx on public.auth_nonces (requester, issued_at desc) where requester is not null;

create table public.sync_state (
  id          smallint primary key default 1 check (id = 1),
  last_block  bigint not null default 0,
  last_run_at timestamptz,
  last_error  text
);
insert into public.sync_state (id) values (1);
