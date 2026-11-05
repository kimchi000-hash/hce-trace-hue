-- ======================================================================
-- VOTECHAIN - KIEM TRA SAU KHI CHAY 3 MIGRATION
-- Chi DOC: file nay la MOT cau SELECT duy nhat (khong INSERT/UPDATE/DELETE/DDL/GRANT), an toan chay tren du an that.
-- Cach dung: dan toan bo vao Supabase SQL Editor -> Run. Cot `ok` cua MOI dong phai la true.
--   * Dong `ok = false`: doc cot `chi_tiet` (neu doi tuong thieu/thua/sai gi) roi gui lai cho nguoi ho tro, dung tiep tuc.
--   * Dong cuoi (ZZ) tong ket so kiem tra dat / tong.
-- Pham vi: chi xet 9 bang va 11 ham cua VoteChain THEO TEN, nen cac bang/ham khac trong schema public khong lam sai ket qua.
-- GIOI HAN: file chi doc cau hinh trong CSDL. KHONG xac minh duoc `owner_id` that su duoc Storage API dien ra sao
--   (can thao tac tai len that qua Storage API, xem docs/SUPABASE_SETUP.md Phan G) va KHONG thay the viec thu dang nhap that.
-- ======================================================================
with
-- ---------------------------------------------------------------- Danh muc ky vong (theo ten)
vc_tables(t, kind) as (values
  ('organizations',          'mirror_org'),
  ('organization_members',   'mirror'),
  ('organization_approvers', 'mirror'),
  ('elections_chain',        'mirror'),
  ('elections_metadata',     'mirror'),
  ('candidates_metadata',    'mirror'),
  ('metadata_history',       'history'),
  ('auth_nonces',            'service_only'),
  ('sync_state',             'service_only')
),
vc_fn(nm, sig, definer, client_ok, nonce) as (values
  ('set_updated_at',           'public.set_updated_at()',                                                          false, false, false),
  ('auth_wallet',              'public.auth_wallet()',                                                             false, true,  false),
  ('has_org_role',             'public.has_org_role(uuid,text[])',                                                 true,  true,  false),
  ('has_org_role_onchain',     'public.has_org_role_onchain(bigint,text[])',                                       true,  true,  false),
  ('org_is_verified',          'public.org_is_verified(uuid)',                                                     true,  true,  false),
  ('limit_metadata_drafts',    'public.limit_metadata_drafts()',                                                   false, false, false),
  ('metadata_history_immutable','public.metadata_history_immutable()',                                             false, false, false),
  ('issue_wallet_nonce',       'public.issue_wallet_nonce(text,text,integer,integer,text,integer)',                true,  false, true),
  ('consume_wallet_nonce',     'public.consume_wallet_nonce(text,text)',                                           true,  false, true),
  ('purge_expired_nonces',     'public.purge_expired_nonces()',                                                    true,  false, true),
  ('can_write_asset',          'public.can_write_asset(text,text)',                                                false, true,  false)
),
vc_buckets(id, size_limit, mimes) as (values
  ('organization-assets', 2097152::bigint,  array['image/jpeg','image/png','image/webp']),
  ('election-assets',     10485760::bigint, array['application/pdf','image/jpeg','image/png','image/webp']),
  ('candidate-assets',    10485760::bigint, array['application/pdf','image/jpeg','image/png','image/webp'])
),
roles(r) as (values ('anon'), ('authenticated')),

-- ---------------------------------------------------------------- Doi tuong that, tra theo ten
tbl as (                       -- bang VoteChain da co trong schema public
  select v.t, v.kind, c.oid as reloid, c.relrowsecurity as rls
  from vc_tables v join pg_class c on c.relname = v.t and c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
),
fn as (                        -- ham VoteChain da co (dung chu ky chinh xac)
  select f.nm, f.sig, f.definer as want_definer, f.client_ok, f.nonce, p.oid as fnoid, p.prosecdef,
         coalesce((select bool_or(c = 'search_path=""') from unnest(p.proconfig) c), false) as sp_empty,
         has_function_privilege('anon',          p.oid, 'EXECUTE') as x_anon,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as x_auth,
         has_function_privilege('public',        p.oid, 'EXECUTE') as x_public,
         has_function_privilege('service_role',  p.oid, 'EXECUTE') as x_service
  from vc_fn f join pg_proc p on p.oid = to_regprocedure(f.sig)::oid
),
tcols as (
  select t.t, t.kind, t.reloid, a.attname as col, a.attnum
  from tbl t join pg_attribute a on a.attrelid = t.reloid and a.attnum > 0 and not a.attisdropped
),
colpriv as (                   -- quyen THEO COT (gom ca quyen cap o muc bang)
  select r.r as role_, c.t, c.kind, c.col, p.p as priv, has_column_privilege(r.r, c.reloid, c.attnum, p.p) as has
  from tcols c cross join roles r cross join (values ('INSERT'), ('UPDATE'), ('REFERENCES')) p(p)
),
tblpriv as (                   -- quyen muc bang
  select r.r as role_, t.t, t.kind, p.p as priv, has_table_privilege(r.r, t.reloid, p.p) as has
  from tbl t cross join roles r cross join (values ('SELECT'), ('DELETE'), ('TRUNCATE'), ('TRIGGER')) p(p)
),
pol as (
  select schemaname, tablename, policyname, cmd, roles::text as roles, permissive,
         regexp_replace(coalesce(qual, ''),       '(public\.|::[a-zA-Z_]+(\[\])?|\s)', '', 'g') as q,       -- bo schema, ep kieu (::text), khoang trang de so sanh on dinh
         regexp_replace(coalesce(with_check, ''), '(public\.|::[a-zA-Z_]+(\[\])?|\s)', '', 'g') as wc,
         left(coalesce(qual, ''), 160) as qual_raw, left(coalesce(with_check, ''), 160) as wc_raw
  from pg_policies
),
bucket as (
  select b.id, b.public, b.file_size_limit, b.allowed_mime_types,
         (select array_agg(m order by m) from unnest(b.allowed_mime_types) m) as mimes_sorted
  from storage.buckets b
),
checks as (

-- ================================================================= A. Doi tuong
select 'A01' as stt, 'Doi tuong' as nhom, '9 bang VoteChain ton tai' as kiem_tra,
       (select count(*) from tbl) = 9 as ok,
       coalesce('Thieu: ' || nullif((select string_agg(v.t, ', ' order by v.t) from vc_tables v where v.t not in (select t from tbl)), ''), 'du 9/9') as chi_tiet
union all select 'A02', 'Doi tuong', 'RLS bat tren ca 9 bang',
       (select count(*) from tbl where rls) = 9 and (select count(*) from tbl) = 9,
       coalesce('RLS TAT o: ' || nullif((select string_agg(t, ', ' order by t) from tbl where not rls), ''), 'ca 9 bang bat RLS')
union all select 'A03', 'Doi tuong', '11 ham VoteChain ton tai (dung chu ky)',
       (select count(*) from fn) = 11,
       coalesce('Thieu/sai chu ky: ' || nullif((select string_agg(f.sig, ', ' order by f.sig) from vc_fn f where f.nm not in (select nm from fn)), ''), 'du 11/11')
union all select 'A04', 'Doi tuong', 'Khong con ham trung ten (ban cu / qua tai) trong schema public',
       not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (select nm from vc_fn)
                   and p.oid not in (select fnoid from fn)),
       coalesce('Ham thua: ' || nullif((select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p where p.pronamespace = 'public'::regnamespace
                   and p.proname in (select nm from vc_fn) and p.oid not in (select fnoid from fn)), ''), 'khong co ban trung ten')
union all select 'A05', 'Doi tuong', 'Trigger cua VoteChain ton tai va dang bat',
       (select count(*) from pg_trigger g join tbl t on t.reloid = g.tgrelid
         where not g.tgisinternal and g.tgenabled = 'O'
           and g.tgname in ('organizations_updated','elections_metadata_updated','candidates_metadata_updated','metadata_history_limit','metadata_history_no_update')) = 5,
       'bat: ' || coalesce((select string_agg(g.tgname, ', ' order by g.tgname) from pg_trigger g join tbl t on t.reloid = g.tgrelid where not g.tgisinternal and g.tgenabled = 'O'), '(khong co)')
union all select 'A06', 'Doi tuong', 'Rang buoc ung vien <=> candidate_id (metadata_history_candidate_id_shape)',
       exists (select 1 from pg_constraint k where k.conname = 'metadata_history_candidate_id_shape' and k.conrelid = 'public.metadata_history'::regclass
               and pg_get_constraintdef(k.oid) like '%candidate_id_onchain IS NOT NULL%' and pg_get_constraintdef(k.oid) like '%candidate%'),
       coalesce((select pg_get_constraintdef(k.oid) from pg_constraint k where k.conname = 'metadata_history_candidate_id_shape'), 'KHONG ton tai')
union all select 'A07', 'Doi tuong', 'Chi muc duy nhat cua ban nhap / hang su kien ton tai',
       (select count(*) from pg_indexes i where i.schemaname = 'public' and i.indexname in ('metadata_history_draft_uq','metadata_history_event_uq')) = 2,
       'co: ' || coalesce((select string_agg(indexname, ', ' order by indexname) from pg_indexes where schemaname = 'public' and indexname in ('metadata_history_draft_uq','metadata_history_event_uq')), '(khong)')
union all select 'A08', 'Doi tuong', 'sync_state co dung 1 dong (id = 1)',
       (select count(*) from public.sync_state) = 1 and exists (select 1 from public.sync_state where id = 1),
       (select count(*)::text || ' dong' from public.sync_state)

-- ================================================================= B. Ham: SECURITY DEFINER, search_path, EXECUTE
union all select 'B01', 'Ham', 'Ca 11 ham co search_path rong (search_path="")',
       (select count(*) from fn where sp_empty) = 11,
       coalesce('Thieu search_path rong: ' || nullif((select string_agg(nm, ', ' order by nm) from fn where not sp_empty), ''), 'ca 11 ham deu rong')
union all select 'B02', 'Ham', 'SECURITY DEFINER dung 6 ham (3 ham nonce + has_org_role, has_org_role_onchain, org_is_verified)',
       not exists (select 1 from fn where prosecdef <> want_definer) and (select count(*) from fn) = 11,
       'DEFINER thuc te: ' || coalesce((select string_agg(nm, ', ' order by nm) from fn where prosecdef), '(khong)')
        || coalesce(' | LECH ky vong: ' || nullif((select string_agg(nm, ', ' order by nm) from fn where prosecdef <> want_definer), ''), '')
union all select 'B03', 'Ham', 'anon/authenticated chi goi duoc dung 5 ham tien ich (auth_wallet, has_org_role, has_org_role_onchain, org_is_verified, can_write_asset)',
       not exists (select 1 from fn where (x_anon <> client_ok) or (x_auth <> client_ok)) and (select count(*) from fn) = 11,
       'client goi duoc: ' || coalesce((select string_agg(nm, ', ' order by nm) from fn where x_anon or x_auth), '(khong)')
        || coalesce(' | LECH ky vong: ' || nullif((select string_agg(nm, ', ' order by nm) from fn where (x_anon <> client_ok) or (x_auth <> client_ok)), ''), '')
union all select 'B04', 'Ham', 'Ham nonce (issue/consume/purge) KHONG goi duoc tu anon, authenticated, PUBLIC',
       (select count(*) from fn where nonce) = 3 and not exists (select 1 from fn where nonce and (x_anon or x_auth or x_public)),
       coalesce('Dang bi mo cho: ' || nullif((select string_agg(nm || '(' || concat_ws('/', case when x_anon then 'anon' end, case when x_auth then 'authenticated' end, case when x_public then 'PUBLIC' end) || ')', ', ')
                                              from fn where nonce and (x_anon or x_auth or x_public)), ''), 'ca 3 ham da bi khoa')
union all select 'B05', 'Ham', 'PUBLIC khong co quyen EXECUTE tren bat ky ham VoteChain nao',
       not exists (select 1 from fn where x_public),
       coalesce('PUBLIC goi duoc: ' || nullif((select string_agg(nm, ', ' order by nm) from fn where x_public), ''), 'khong ham nao')
union all select 'B06', 'Ham', 'service_role (Edge Function) goi duoc ca 11 ham',
       (select count(*) from fn where x_service) = 11,
       coalesce('service_role KHONG goi duoc: ' || nullif((select string_agg(nm, ', ' order by nm) from fn where not x_service), ''), 'ca 11 ham')
union all select 'B07', 'Ham', 'can_write_asset: dau van tay noi dung dung thiet ke (ham dung duong dan, vai tro theo bucket, khong svg/html)',
       coalesce((select pg_get_functiondef(fnoid) from fn where nm = 'can_write_asset') ~ 'organization-assets'
            and (select pg_get_functiondef(fnoid) from fn where nm = 'can_write_asset') ~ 'election-assets'
            and (select pg_get_functiondef(fnoid) from fn where nm = 'can_write_asset') ~ 'candidate-assets'
            and (select pg_get_functiondef(fnoid) from fn where nm = 'can_write_asset') ~ 'has_org_role_onchain'
            and (select pg_get_functiondef(fnoid) from fn where nm = 'can_write_asset') ~ '0x\[0-9a-f\]\{64\}'
            and (select pg_get_functiondef(fnoid) from fn where nm = 'can_write_asset') !~* 'svg|html|gif|zip', false),
       'kiem tra van tay chuoi; hanh vi that duoc thu bang test (supabase/tests) va Phan G'
union all select 'B08', 'Ham', 'save_organization_profile: SECURITY DEFINER, search_path rong, chi authenticated goi duoc (anon va PUBLIC khong), cot profile khong ghi truc tiep',
       coalesce((select p.prosecdef and coalesce(p.proconfig, '{}') && array['search_path=""']
                        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                        and not has_function_privilege('anon', p.oid, 'EXECUTE')
                        and not has_function_privilege('public', p.oid, 'EXECUTE')
                        and not has_column_privilege('authenticated', 'public.organizations', 'profile', 'UPDATE')
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'save_organization_profile'), false),
       'ham luu ho so to chuc (migration 20261106000001)'

-- ================================================================= C. Quyen client tren bang
union all select 'C01', 'Quyen bang', 'Quyen SELECT: anon doc 6 bang cong khai; authenticated them organization_members; KHONG doc auth_nonces/sync_state',
       not exists (select 1 from tblpriv where priv = 'SELECT' and has <>
              case when kind = 'service_only' then false
                   when t = 'organization_members' then role_ = 'authenticated'
                   else true end),
       'SELECT thuc te: ' || coalesce((select string_agg(role_ || ':' || t, ', ' order by role_, t) from tblpriv where priv = 'SELECT' and has), '(khong)')
union all select 'C02', 'Quyen bang', 'Khong co INSERT/UPDATE/DELETE cho client tren 5 bang mirror + auth_nonces + sync_state',
       not exists (select 1 from colpriv where priv in ('INSERT','UPDATE') and has and kind in ('mirror','service_only'))
       and not exists (select 1 from tblpriv where priv = 'DELETE' and has and kind in ('mirror','service_only')),
       coalesce('VI PHAM: ' || nullif((select string_agg(distinct role_ || ' ' || priv || ' ' || t, ', ') from (
              select role_, priv, t from colpriv where priv in ('INSERT','UPDATE') and has and kind in ('mirror','service_only')
              union all select role_, priv, t from tblpriv where priv = 'DELETE' and has and kind in ('mirror','service_only')) z), ''), 'khong co quyen ghi nao')
union all select 'C03', 'Quyen bang', 'auth_nonces va sync_state: anon/authenticated khong co BAT KY quyen nao',
       not exists (select 1 from colpriv where has and kind = 'service_only') and not exists (select 1 from tblpriv where has and kind = 'service_only'),
       coalesce('Dang co quyen: ' || nullif((select string_agg(distinct role_ || ' ' || priv || ' ' || t, ', ') from (
              select role_, priv, t from colpriv where has and kind = 'service_only' union all select role_, priv, t from tblpriv where has and kind = 'service_only') z), ''), 'khong co quyen nao')
union all select 'C04', 'Quyen bang', 'organizations: authenticated chi UPDATE dung 3 cot (description, logo_url, organization_type); khong INSERT/DELETE; anon khong ghi',
       coalesce((select string_agg(col, ',' order by col) from colpriv where role_ = 'authenticated' and t = 'organizations' and priv = 'UPDATE' and has), '') = 'description,logo_url,organization_type'
       and not exists (select 1 from colpriv where t = 'organizations' and priv = 'INSERT' and has)
       and not exists (select 1 from tblpriv where t = 'organizations' and priv = 'DELETE' and has)
       and not exists (select 1 from colpriv where t = 'organizations' and priv = 'UPDATE' and has and role_ = 'anon'),
       'authenticated UPDATE cot: ' || coalesce((select string_agg(col, ', ' order by col) from colpriv where role_ = 'authenticated' and t = 'organizations' and priv = 'UPDATE' and has), '(khong)')
union all select 'C05', 'Quyen bang', 'metadata_history: authenticated chi INSERT dung 6 cot cho phep',
       coalesce((select string_agg(col, ',' order by col) from colpriv where role_ = 'authenticated' and t = 'metadata_history' and priv = 'INSERT' and has), '')
         = 'candidate_id_onchain,content,created_by,metadata_hash,metadata_type,organization_id',
       'authenticated INSERT cot: ' || coalesce((select string_agg(col, ', ' order by col) from colpriv where role_ = 'authenticated' and t = 'metadata_history' and priv = 'INSERT' and has), '(khong)')
union all select 'C06', 'Quyen bang', 'metadata_history: anon khong ghi; khong ai UPDATE; chi authenticated DELETE (RLS gioi han ban nhap cua chinh minh)',
       not exists (select 1 from colpriv where t = 'metadata_history' and priv in ('INSERT','UPDATE') and has and role_ = 'anon')
       and not exists (select 1 from colpriv where t = 'metadata_history' and priv = 'UPDATE' and has)
       and exists (select 1 from tblpriv where t = 'metadata_history' and priv = 'DELETE' and has and role_ = 'authenticated')
       and not exists (select 1 from tblpriv where t = 'metadata_history' and priv = 'DELETE' and has and role_ = 'anon'),
       'DELETE: ' || coalesce((select string_agg(role_, ', ') from tblpriv where t = 'metadata_history' and priv = 'DELETE' and has), '(khong)')
        || ' | UPDATE: ' || coalesce((select string_agg(distinct role_, ', ') from colpriv where t = 'metadata_history' and priv = 'UPDATE' and has), '(khong)')
union all select 'C07', 'Quyen bang', 'Khong ai (anon, authenticated) co TRUNCATE, TRIGGER hoac REFERENCES tren 9 bang',
       not exists (select 1 from tblpriv where priv in ('TRUNCATE','TRIGGER') and has) and not exists (select 1 from colpriv where priv = 'REFERENCES' and has),
       coalesce('VI PHAM: ' || nullif((select string_agg(distinct role_ || ' ' || priv || ' ' || t, ', ') from (
              select role_, priv, t from tblpriv where priv in ('TRUNCATE','TRIGGER') and has union all select role_, priv, t from colpriv where priv = 'REFERENCES' and has) z), ''), 'khong co')

-- ================================================================= D. RLS policy (schema public)
union all select 'D01', 'Policy', 'organizations_manager_update: UPDATE, authenticated, chi Manager va to chuc Verified',
       exists (select 1 from pol where schemaname = 'public' and tablename = 'organizations' and policyname = 'organizations_manager_update' and cmd = 'UPDATE'
               and roles = '{authenticated}' and q like '%Verified%' and q like '%Manager%' and q like '%has_org_role(%' and wc like '%Verified%' and wc like '%Manager%' and wc like '%has_org_role(%'),
       coalesce((select 'cmd=' || cmd || ' roles=' || roles || ' qual=' || qual_raw from pol where policyname = 'organizations_manager_update' and tablename = 'organizations'), 'KHONG ton tai')
union all select 'D02', 'Policy', 'history_insert: INSERT, authenticated, vi lay tu JWT + Proposer/Manager + to chuc Verified + khong tu danh dau onchain_seen',
       exists (select 1 from pol where schemaname = 'public' and tablename = 'metadata_history' and policyname = 'history_insert' and cmd = 'INSERT' and roles = '{authenticated}'
               and wc ~ 'created_by\)?=auth_wallet\(\)' and wc like '%org_is_verified(%' and wc like '%has_org_role(%' and wc like '%Proposer%' and wc like '%Manager%' and wc like '%NOTonchain_seen%'),
       coalesce((select 'cmd=' || cmd || ' roles=' || roles || ' check=' || wc_raw from pol where policyname = 'history_insert' and tablename = 'metadata_history'), 'KHONG ton tai')
union all select 'D03', 'Policy', 'history_delete_own_draft: DELETE, authenticated, chi ban nhap (onchain_seen = false) cua chinh nguoi gui',
       exists (select 1 from pol where schemaname = 'public' and tablename = 'metadata_history' and policyname = 'history_delete_own_draft' and cmd = 'DELETE' and roles = '{authenticated}'
               and q ~ 'created_by\)?=auth_wallet\(\)' and q like '%NOTonchain_seen%'),
       coalesce((select 'cmd=' || cmd || ' roles=' || roles || ' qual=' || qual_raw from pol where policyname = 'history_delete_own_draft' and tablename = 'metadata_history'), 'KHONG ton tai')
union all select 'D04', 'Policy', 'Chi co dung 3 policy GHI tren 9 bang (history_insert, history_delete_own_draft, organizations_manager_update); khong policy ALL/UPDATE/INSERT/DELETE nao khac',
       (select count(*) from pol p join tbl t on t.t = p.tablename where p.schemaname = 'public' and p.cmd in ('INSERT','UPDATE','DELETE','ALL')
         and p.policyname in ('history_insert','history_delete_own_draft','organizations_manager_update')) = 3
       and not exists (select 1 from pol p join tbl t on t.t = p.tablename where p.schemaname = 'public' and p.cmd in ('INSERT','UPDATE','DELETE','ALL')
         and p.policyname not in ('history_insert','history_delete_own_draft','organizations_manager_update')),
       'policy ghi: ' || coalesce((select string_agg(p.tablename || '.' || p.policyname || '(' || p.cmd || ')', ', ' order by p.tablename, p.policyname)
                                   from pol p join tbl t on t.t = p.tablename where p.schemaname = 'public' and p.cmd in ('INSERT','UPDATE','DELETE','ALL')), '(khong)')
union all select 'D05', 'Policy', 'auth_nonces va sync_state KHONG co policy nao (chi service_role truy cap)',
       not exists (select 1 from pol where schemaname = 'public' and tablename in ('auth_nonces','sync_state')),
       coalesce('Policy thua: ' || nullif((select string_agg(tablename || '.' || policyname, ', ') from pol where schemaname = 'public' and tablename in ('auth_nonces','sync_state')), ''), 'khong co')
union all select 'D06', 'Policy', 'Moi bang client doc duoc deu co it nhat 1 policy SELECT (neu khong RLS se tra 0 dong)',
       not exists (select 1 from tbl t where t.kind <> 'service_only' and not exists (select 1 from pol p where p.schemaname = 'public' and p.tablename = t.t and p.cmd in ('SELECT','ALL'))),
       coalesce('Thieu SELECT policy: ' || nullif((select string_agg(t.t, ', ') from tbl t where t.kind <> 'service_only'
                 and not exists (select 1 from pol p where p.schemaname = 'public' and p.tablename = t.t and p.cmd in ('SELECT','ALL'))), ''), 'du')
union all select 'D07', 'Policy', 'Khong co policy RESTRICTIVE bat thuong, khong policy nao mo cho PUBLIC/anon ghi tren 9 bang',
       not exists (select 1 from pol p join tbl t on t.t = p.tablename where p.schemaname = 'public' and p.cmd in ('INSERT','UPDATE','DELETE','ALL') and (p.roles like '%public%' or p.roles like '%anon%')),
       'ok neu khong co policy ghi nao ap dung cho public/anon'

-- ================================================================= E. Storage: bucket
union all select 'E01', 'Storage bucket', 'organization-assets: Public, 2 MB, chi image/png, image/jpeg, image/webp',
       exists (select 1 from vc_buckets v join bucket b on b.id = v.id where v.id = 'organization-assets' and b.public and b.file_size_limit = v.size_limit and b.mimes_sorted = v.mimes),
       coalesce((select format('public=%s, file_size_limit=%s, mime=%s', b.public, b.file_size_limit, b.mimes_sorted) from bucket b where b.id = 'organization-assets'), 'bucket KHONG ton tai')
union all select 'E02', 'Storage bucket', 'election-assets: Public, 10 MB, chi image/png, image/jpeg, image/webp, application/pdf',
       exists (select 1 from vc_buckets v join bucket b on b.id = v.id where v.id = 'election-assets' and b.public and b.file_size_limit = v.size_limit and b.mimes_sorted = v.mimes),
       coalesce((select format('public=%s, file_size_limit=%s, mime=%s', b.public, b.file_size_limit, b.mimes_sorted) from bucket b where b.id = 'election-assets'), 'bucket KHONG ton tai')
union all select 'E03', 'Storage bucket', 'candidate-assets: Public, 10 MB, chi image/png, image/jpeg, image/webp, application/pdf',
       exists (select 1 from vc_buckets v join bucket b on b.id = v.id where v.id = 'candidate-assets' and b.public and b.file_size_limit = v.size_limit and b.mimes_sorted = v.mimes),
       coalesce((select format('public=%s, file_size_limit=%s, mime=%s', b.public, b.file_size_limit, b.mimes_sorted) from bucket b where b.id = 'candidate-assets'), 'bucket KHONG ton tai')

-- ================================================================= F. Storage: policy tren storage.objects
union all select 'F01', 'Storage policy', 'storage.objects bat RLS',
       coalesce((select c.relrowsecurity from pg_class c where c.oid = 'storage.objects'::regclass), false),
       'relrowsecurity = ' || coalesce((select c.relrowsecurity::text from pg_class c where c.oid = 'storage.objects'::regclass), 'khong co bang')
union all select 'F02', 'Storage policy', 'assets_read_public: SELECT, chi 3 bucket cua VoteChain',
       exists (select 1 from pol where schemaname = 'storage' and tablename = 'objects' and policyname = 'assets_read_public' and cmd = 'SELECT'
               and q like '%bucket_id%' and q like '%organization-assets%' and q like '%election-assets%' and q like '%candidate-assets%' and q not like '%owner%'),
       coalesce((select 'cmd=' || cmd || ' roles=' || roles || ' qual=' || qual_raw from pol where schemaname = 'storage' and policyname = 'assets_read_public'), 'KHONG ton tai')
union all select 'F03', 'Storage policy', 'assets_insert_org_roles: INSERT, authenticated, WITH CHECK dung bang can_write_asset(bucket_id, name)',
       exists (select 1 from pol where schemaname = 'storage' and tablename = 'objects' and policyname = 'assets_insert_org_roles' and cmd = 'INSERT'
               and roles = '{authenticated}' and wc = 'can_write_asset(bucket_id,name)'),
       coalesce((select 'cmd=' || cmd || ' roles=' || roles || ' check=' || wc_raw from pol where schemaname = 'storage' and policyname = 'assets_insert_org_roles'), 'KHONG ton tai')
union all select 'F04', 'Storage policy', 'assets_delete_own: DELETE, authenticated, owner_id = sub cua JWT VA can_write_asset(bucket_id, name)',
       exists (select 1 from pol where schemaname = 'storage' and tablename = 'objects' and policyname = 'assets_delete_own' and cmd = 'DELETE'
               and roles = '{authenticated}' and q like '%owner_id=%' and q like '%sub%' and q like '%can_write_asset(bucket_id,name)%'),
       coalesce((select 'cmd=' || cmd || ' roles=' || roles || ' qual=' || qual_raw from pol where schemaname = 'storage' and policyname = 'assets_delete_own'), 'KHONG ton tai')
union all select 'F05', 'Storage policy', 'KHONG co policy UPDATE (hoac ALL) nao tren storage.objects: khong ghi de, doi ten, chuyen thu muc/bucket',
       not exists (select 1 from pol where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE','ALL')),
       coalesce('Policy UPDATE/ALL dang co: ' || nullif((select string_agg(policyname || '(' || cmd || ')', ', ') from pol where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE','ALL')), ''), 'khong co')
union all select 'F06', 'Storage policy', 'Khong co policy GHI (INSERT/DELETE/UPDATE/ALL) nao khac ngoai 2 policy thiet ke tren storage.objects',
       not exists (select 1 from pol where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT','UPDATE','DELETE','ALL') and policyname not in ('assets_insert_org_roles','assets_delete_own')),
       'policy ghi tren storage.objects: ' || coalesce((select string_agg(policyname || '(' || cmd || ', roles=' || roles || ')', ', ' order by policyname) from pol where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT','UPDATE','DELETE','ALL')), '(khong)')
union all select 'F07', 'Storage policy', 'Khong co policy nao khac nhac toi 3 bucket cua VoteChain (tranh policy rong mo quyen ngoai y muon)',
       not exists (select 1 from pol where schemaname = 'storage' and tablename = 'objects' and policyname not in ('assets_read_public','assets_insert_org_roles','assets_delete_own')
                   and (q ~ 'organization-assets|election-assets|candidate-assets' or wc ~ 'organization-assets|election-assets|candidate-assets')),
       coalesce('Policy khac nhac toi bucket: ' || nullif((select string_agg(policyname, ', ') from pol where schemaname = 'storage' and tablename = 'objects' and policyname not in ('assets_read_public','assets_insert_org_roles','assets_delete_own')
                   and (q ~ 'organization-assets|election-assets|candidate-assets' or wc ~ 'organization-assets|election-assets|candidate-assets')), ''), 'khong co')
union all select 'F08', 'Storage policy', 'Policy ghi chi ap dung cho authenticated (anon khong ghi duoc vao Storage)',
       not exists (select 1 from pol where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT','UPDATE','DELETE','ALL') and (roles like '%anon%' or roles like '%public%')),
       'xem F06 de biet roles cua tung policy ghi'
union all select 'F09', 'Storage cau hinh', 'storage.objects co cot owner_id kieu text (chi kiem tra CAU TRUC; KHONG xac minh gia tri owner_id do Storage API dien)',
       exists (select 1 from pg_attribute a where a.attrelid = 'storage.objects'::regclass and a.attname = 'owner_id' and a.atttypid = 'text'::regtype and not a.attisdropped),
       'chi la cau truc bang. owner_id thuc te can thu bang tai len that (docs/SUPABASE_SETUP.md Phan G)'
)
select stt, nhom, kiem_tra, ok, chi_tiet from checks
union all
select 'ZZ', 'TONG KET', 'So kiem tra dat / tong (tat ca phai dat)',
       (select count(*) from checks where ok is not true) = 0,
       (select count(*) filter (where ok is true) from checks)::text || ' / ' || (select count(*) from checks)::text || ' dat'
       || coalesce(' | KHONG DAT: ' || nullif((select string_agg(stt, ', ' order by stt) from checks where ok is not true), ''), '')
order by stt;
