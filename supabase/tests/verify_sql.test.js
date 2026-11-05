// Kiem thu supabase/sql/verify_deployment.sql: (1) chi-doc that su, (2) dat 100% tren schema dung, (3) khong bi nhieu boi doi tuong ngoai du an,
// (4) moi sai lech (tiem bang thay doi that trong giao dich roi rollback) lam dung CAC dong ky vong chuyen false, khong hon khong kem.
const { PGlite } = require("@electric-sql/pglite");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..");
const VERIFY = fs.readFileSync(path.join(DIR, "sql/verify_deployment.sql"), "utf8");
let db;

const verify = async () => (await db.query(VERIFY)).rows;
const failing = (rows) => rows.filter((r) => r.ok !== true).map((r) => r.stt).sort();
/** Chay mutation trong giao dich, lay danh sach dong false, roi rollback. */
async function withMutation(sql, fn) {
  await db.exec("begin");
  try { await db.exec(sql); return await fn(await verify()); } finally { await db.exec("rollback"); }
}

test.before(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(DIR, "tests/stubs.sql"), "utf8"));
  for (const f of fs.readdirSync(path.join(DIR, "migrations")).sort()) await db.exec(fs.readFileSync(path.join(DIR, "migrations", f), "utf8"));
});
test.after(async () => { await db.close(); });

test("1. File chi chua MOT cau SELECT: khong DML/DDL/GRANT (quet van ban, bo comment va chuoi)", () => {
  const noComments = VERIFY.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  const noStrings = noComments.replace(/'([^']|'')*'/g, "''");
  assert.equal((noStrings.match(/;/g) || []).length, 1, "phai dung 1 cau lenh");
  assert.match(noStrings.trim(), /^with\b/i);
  const bad = noStrings.match(/\b(insert|update|delete|drop|create|alter|grant|revoke|truncate|copy|vacuum|analyze|call|do|set|reset|begin|commit|rollback|listen|notify|lock|nextval|setval|pg_advisory\w*|pg_sleep|set_config)\b/gi);
  assert.equal(bad, null, "tu khoa cam: " + JSON.stringify(bad));
});

test("2. Chay duoc trong giao dich READ ONLY va khong lam doi du lieu / cau truc", async () => {
  const snap = async () => {
    const out = {};
    for (const t of (await db.query("select schemaname s, tablename t from pg_tables where schemaname in ('public','storage') order by 1,2")).rows)
      out[`${t.s}.${t.t}`] = (await db.query(`select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h, count(*)::int n from ${t.s}.${t.t} x`)).rows[0];
    out.catalog = (await db.query(`select md5(string_agg(c, '|' order by c)) h from (
        select 'c:' || relname || relrowsecurity::text || relacl::text c from pg_class where relnamespace in ('public'::regnamespace,'storage'::regnamespace)
        union all select 'p:' || policyname || coalesce(qual,'') || coalesce(with_check,'') from pg_policies
        union all select 'f:' || oid::text || coalesce(proacl::text,'') || coalesce(proconfig::text,'') from pg_proc where pronamespace = 'public'::regnamespace) z`)).rows[0];
    return out;
  };
  await db.query("insert into public.organizations (organization_id_onchain,name,verification_status,created_by) values (1,'X','Verified','0x" + "1".repeat(40) + "')");
  const before = await snap();
  await db.exec("begin read only");
  let rows; try { rows = await verify(); await assert.rejects(db.exec("create table public.zzz(a int)"), /read-only/i); } finally { await db.exec("rollback"); }
  assert.ok(rows.length > 30);
  assert.deepEqual(await snap(), before);
  await db.exec("delete from public.organizations");
});

test("3. Schema dung -> moi dong ok = true, moi dong co chi_tiet, dong tong ket khop", async () => {
  const rows = await verify();
  assert.deepEqual(failing(rows), [], JSON.stringify(rows.filter((r) => r.ok !== true)));
  for (const r of rows) { assert.equal(typeof r.ok, "boolean"); assert.ok(r.chi_tiet && r.chi_tiet.length > 0, r.stt + " thieu chi_tiet"); assert.ok(r.kiem_tra && r.nhom); }
  const ids = rows.map((r) => r.stt);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(new Set(ids).size, ids.length);
  assert.match(rows.at(-1).chi_tiet, new RegExp(`^${rows.length - 1} / ${rows.length - 1} dat$`));
  for (const id of ["E01", "E02", "E03", "F02", "F03", "F04", "F05"]) assert.ok(ids.includes(id), "thieu " + id);
});

test("4. Doi tuong NGOAI du an (bang, ham, bucket, policy khac) khong lam sai ket qua", async () => {
  await withMutation(`
    create table public.todos (id int primary key, note text);
    grant all on public.todos to anon, authenticated;
    create function public.helper() returns int language sql as 'select 1';
    create function public.issue_wallet_nonce_demo() returns int language sql as 'select 2';
    grant execute on function public.helper(), public.issue_wallet_nonce_demo() to anon, authenticated;
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('avatars','avatars',true,1,array['image/svg+xml']);
    create policy "avatars_rw" on storage.objects for select using (bucket_id = 'avatars');
    create policy "avatars_ins" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
  `, async (rows) => {
    // avatars_ins la policy GHI khac ngoai thiet ke => F06 phai bao (day la hanh vi dung: nguoi dung duoc nhac xem xet thu cong)
    assert.deepEqual(failing(rows), ["F06", "ZZ"]);
    assert.match(rows.find((r) => r.stt === "F06").chi_tiet, /avatars_ins/);
  });
  await withMutation(`
    create table public.todos (id int primary key); grant all on public.todos to anon, authenticated;
    create function public.helper() returns int language sql as 'select 1'; grant execute on function public.helper() to anon, authenticated;
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('avatars','avatars',true,1,array['image/svg+xml']);
    create policy "avatars_rw" on storage.objects for select using (bucket_id = 'avatars');
  `, async (rows) => assert.deepEqual(failing(rows), []));
});

const CASES = [
  ["bang mirror cho client UPDATE", "grant update on public.elections_chain to authenticated", ["C02"]],
  ["bang mirror cho client INSERT theo cot", "grant insert (note) on public.organization_members to anon".replace("note", "role"), ["C02"]],
  ["bang mirror cho client DELETE", "grant delete on public.organization_members to authenticated", ["C02"]],
  ["anon doc auth_nonces", "grant select on public.auth_nonces to anon", ["C01", "C03"]],
  ["authenticated ghi sync_state", "grant update (last_error) on public.sync_state to authenticated", ["C02", "C03"]],
  ["organizations: them cot UPDATE", "grant update (name) on public.organizations to authenticated", ["C04"]],
  ["organizations: cho INSERT", "grant insert on public.organizations to authenticated", ["C04"]],
  ["metadata_history: them cot INSERT (onchain_seen)", "grant insert (onchain_seen) on public.metadata_history to authenticated", ["C05"]],
  ["metadata_history: cho UPDATE cot", "grant update (content) on public.metadata_history to authenticated", ["C06"]],
  ["metadata_history: anon DELETE", "grant delete on public.metadata_history to anon", ["C06"]],
  ["TRUNCATE cho client", "grant truncate on public.organizations to authenticated", ["C07"]],
  ["authenticated goi duoc issue_wallet_nonce", "grant execute on function public.issue_wallet_nonce(text,text,integer,integer,text,integer) to authenticated", ["B03", "B04"]],
  ["PUBLIC goi duoc purge_expired_nonces", "grant execute on function public.purge_expired_nonces() to public", ["B03", "B04", "B05"]],
  ["client goi duoc trigger function", "grant execute on function public.limit_metadata_drafts() to anon", ["B03"]],
  ["service_role mat quyen ham", "revoke execute on function public.consume_wallet_nonce(text,text) from service_role", ["B06"]],
  ["ham mat search_path", "alter function public.has_org_role(uuid, text[]) reset search_path", ["B01"]],
  ["ham thanh SECURITY DEFINER", "alter function public.auth_wallet() security definer", ["B02"]],
  ["ham nonce mat SECURITY DEFINER", "alter function public.purge_expired_nonces() security invoker", ["B02"]],
  ["con ham trung ten ban cu", "create function public.issue_wallet_nonce(text,text,int,int) returns int language sql as 'select 1'", ["A04"]],
  ["ham bi doi ten", "alter function public.can_write_asset(text,text) rename to can_write_asset_x", ["A03", "B01", "B02", "B03", "B06", "B07", "F03", "F04"]],   // ham mat -> cac kiem tra dem ham va 2 policy dang tro vao ten cu cung lech
  ["tat RLS sync_state", "alter table public.sync_state disable row level security", ["A02"]],
  ["go trigger gioi han 200", "drop trigger metadata_history_limit on public.metadata_history", ["A05"]],
  ["go rang buoc candidate_id", "alter table public.metadata_history drop constraint metadata_history_candidate_id_shape", ["A06"]],
  ["go chi muc duy nhat", "drop index public.metadata_history_draft_uq", ["A07"]],
  ["sync_state het dong", "delete from public.sync_state", ["A08"]],
  ["policy ghi them cho mirror", "create policy x on public.elections_chain for insert to authenticated with check (true)", ["D04"]],
  ["policy ALL cho anon", "create policy x on public.organization_members for all to anon using (true) with check (true)", ["D04", "D07"]],
  ["policy tren auth_nonces", "create policy y on public.auth_nonces for select using (true)", ["D05"]],
  ["mat policy SELECT cua bang", "drop policy elections_chain_read on public.elections_chain", ["D06"]],
  ["history_insert bo kiem tra Verified", "alter policy history_insert on public.metadata_history with check (created_by = public.auth_wallet())", ["D02"]],
  ["history_delete bo dieu kien ban nhap", "alter policy history_delete_own_draft on public.metadata_history using (created_by = public.auth_wallet())", ["D03"]],
  ["organizations update khong can Verified", "alter policy organizations_manager_update on public.organizations using (public.has_org_role(id, array['Manager'])) with check (public.has_org_role(id, array['Manager']))", ["D01"]],
  ["bucket organization-assets them svg", "update storage.buckets set allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml'] where id = 'organization-assets'", ["E01"]],
  ["bucket organization-assets thieu webp", "update storage.buckets set allowed_mime_types = array['image/png','image/jpeg'] where id = 'organization-assets'", ["E01"]],
  ["bucket organization-assets 5 MB", "update storage.buckets set file_size_limit = 5242880 where id = 'organization-assets'", ["E01"]],
  ["bucket election-assets 50 MB", "update storage.buckets set file_size_limit = 52428800 where id = 'election-assets'", ["E02"]],
  ["bucket election-assets mat pdf", "update storage.buckets set allowed_mime_types = array['image/png','image/jpeg','image/webp'] where id = 'election-assets'", ["E02"]],
  ["bucket candidate-assets private", "update storage.buckets set public = false where id = 'candidate-assets'", ["E03"]],
  ["bucket candidate-assets cho moi MIME", "update storage.buckets set allowed_mime_types = null where id = 'candidate-assets'", ["E03"]],
  ["mat bucket", "delete from storage.buckets where id = 'candidate-assets'", ["E03"]],
  ["storage.objects tat RLS", "alter table storage.objects disable row level security", ["F01"]],
  ["read policy mo rong sang bucket khac", "alter policy assets_read_public on storage.objects using (true)", ["F02"]],
  ["insert policy bo can_write_asset", "alter policy assets_insert_org_roles on storage.objects with check (true)", ["F03"]],
  ["delete policy bo owner_id", "alter policy assets_delete_own on storage.objects using (public.can_write_asset(bucket_id, name))", ["F04"]],
  ["delete policy bo can_write_asset", "alter policy assets_delete_own on storage.objects using (owner_id = (select auth.jwt() ->> 'sub'))", ["F04"]],
  ["mat delete policy", "drop policy assets_delete_own on storage.objects", ["F04"]],
  ["them policy UPDATE storage", "create policy upd on storage.objects for update to authenticated using (true)", ["F05", "F06"]],
  ["them policy ALL storage cho authenticated", "create policy allp on storage.objects for all to authenticated using (bucket_id = 'organization-assets')", ["F05", "F06", "F07"]],
  ["them policy INSERT cho anon", "create policy ai on storage.objects for insert to anon with check (true)", ["F06", "F08"]],
  ["policy SELECT khac nhac toi bucket VoteChain", "create policy sel2 on storage.objects for select using (bucket_id = 'candidate-assets')", ["F07"]],
];

for (const [name, sql, expect] of CASES)
  test(`5. Lech cau hinh -> bao dung dong: ${name}`, async () => {
    await withMutation(sql, async (rows) => assert.deepEqual(failing(rows), [...expect, "ZZ"].sort(), JSON.stringify(rows.filter((r) => r.ok !== true).map((r) => [r.stt, r.chi_tiet]))));
  });

test("6. Dong sai luon co chi_tiet giup tim nguyen nhan (ten doi tuong / gia tri thuc te)", async () => {
  const get = async (sql, id) => withMutation(sql, async (rows) => rows.find((r) => r.stt === id));
  assert.match((await get("update storage.buckets set file_size_limit = 5242880 where id = 'organization-assets'", "E01")).chi_tiet, /5242880/);
  assert.match((await get("update storage.buckets set allowed_mime_types = array['image/svg+xml'] where id = 'organization-assets'", "E01")).chi_tiet, /svg/);
  assert.match((await get("delete from storage.buckets where id = 'candidate-assets'", "E03")).chi_tiet, /KHONG ton tai/);
  assert.match((await get("grant update on public.elections_chain to authenticated", "C02")).chi_tiet, /authenticated UPDATE elections_chain/);
  assert.match((await get("grant execute on function public.purge_expired_nonces() to public", "B04")).chi_tiet, /purge_expired_nonces\(anon\/authenticated\/PUBLIC\)/);
  assert.match((await get("alter function public.has_org_role(uuid, text[]) reset search_path", "B01")).chi_tiet, /has_org_role/);
  assert.match((await get("create policy upd on storage.objects for update to authenticated using (true)", "F05")).chi_tiet, /upd\(UPDATE\)/);
  assert.match((await get("drop policy assets_delete_own on storage.objects", "F04")).chi_tiet, /KHONG ton tai/);
  assert.match((await get("alter table public.sync_state disable row level security", "A02")).chi_tiet, /sync_state/);
  assert.match((await get("alter function public.can_write_asset(text,text) rename to can_write_asset_x", "A03")).chi_tiet, /can_write_asset/);
});
