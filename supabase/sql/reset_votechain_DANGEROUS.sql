-- ======================================================================
-- CHI DUNG KHI MUON LAM LAI TU DAU TREN DU AN THU NGHIEM. XOA TOAN BO DU LIEU VOTECHAIN (9 bang).
-- Chi xoa dung cac doi tuong do 3 migration tao ra. KHONG dung `drop schema public cascade`:
-- tren Supabase lenh do xoa ca quyen mac dinh va extension, lam hong du an.
-- Bucket Storage khong xoa o day: vao Dashboard > Storage de xoa file roi xoa bucket (neu can).
-- ======================================================================
drop policy if exists "assets_read_public"       on storage.objects;
drop policy if exists "assets_insert_org_roles"  on storage.objects;
drop policy if exists "assets_delete_own"        on storage.objects;

drop table if exists public.metadata_history        cascade;
drop table if exists public.candidates_metadata     cascade;
drop table if exists public.elections_metadata      cascade;
drop table if exists public.elections_chain         cascade;
drop table if exists public.organization_approvers  cascade;
drop table if exists public.organization_members    cascade;
drop table if exists public.organizations           cascade;
drop table if exists public.auth_nonces             cascade;
drop table if exists public.sync_state              cascade;

drop function if exists public.can_write_asset(text, text);
drop function if exists public.purge_expired_nonces();
drop function if exists public.consume_wallet_nonce(text, text);
drop function if exists public.issue_wallet_nonce(text, text, int, int, text, int);
drop function if exists public.metadata_history_immutable();
drop function if exists public.limit_metadata_drafts();
drop function if exists public.org_is_verified(uuid);
drop function if exists public.has_org_role_onchain(bigint, text[]);
drop function if exists public.has_org_role(uuid, text[]);
drop function if exists public.auth_wallet();
drop function if exists public.set_updated_at();

drop domain if exists public.bytes32_hex;
drop domain if exists public.wallet_address;
