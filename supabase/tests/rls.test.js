// Kiem thu migration + RLS + Storage policy + nonce bang PGlite (PostgreSQL that chay trong WASM).
// Chay:  npm run test:supabase
// Gioi han: day KHONG phai Supabase that (auth / storage duoc gia lap toi thieu o stubs.sql), nhung cac policy,
// grant, trigger va ham la SQL that cua migration nen hanh vi RLS la hanh vi PostgreSQL that.
const { PGlite } = require("@electric-sql/pglite");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..");
const w = (n) => "0x" + n.toString(16).padStart(40, "0");
const H = (n) => "0x" + n.toString(16).padStart(64, "0");
const MGR = w(1), PROP = w(2), MEM = w(3), OUT = w(4), MGR_B = w(5);
const uuidOf = (n) => "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");

let db, orgA, orgB, orgC;

async function run(ctx, sql, params) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(ctx.claims || {})]);
  if (ctx.role !== "postgres") await db.exec("set role " + ctx.role);
  try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
}
const who = (wallet, n = 1) => ({ role: "authenticated", claims: { role: "authenticated", sub: uuidOf(n), app_metadata: { wallet }, user_metadata: {} } });
const anon = { role: "anon", claims: { role: "anon" } };
const service = { role: "service_role", claims: { role: "service_role" } };
const admin = { role: "postgres", claims: {} };
const denied = (p, re = /permission denied|row-level security|violates|nonce|Qua nhieu|khong duoc sua|check constraint/i) =>
  assert.rejects(p, (e) => { assert.match(String(e.message), re); return true; });
const rows = async (ctx, sql, params) => (await run(ctx, sql, params)).rows;

test.before(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(DIR, "tests/stubs.sql"), "utf8"));
  for (const f of fs.readdirSync(path.join(DIR, "migrations")).sort()) await db.exec(fs.readFileSync(path.join(DIR, "migrations", f), "utf8"));
  // Du lieu mau CHI cho kiem thu (khong nam trong migration)
  const o = async (id, name, st, owner) => (await db.query(
    "insert into public.organizations (organization_id_onchain, name, verification_status, created_by) values ($1,$2,$3,$4) returning id", [id, name, st, owner])).rows[0].id;
  orgA = await o(1, "CLB A", "Verified", MGR);
  orgB = await o(2, "To chuc B (cho xac minh)", "Pending", MGR_B);
  orgC = await o(3, "To chuc C (dinh chi)", "Suspended", w(9));
  const m = (org, wa, role) => db.query("insert into public.organization_members (organization_id, wallet_address, role) values ($1,$2,$3)", [org, wa, role]);
  await m(orgA, MGR, "Manager"); await m(orgA, PROP, "Proposer"); await m(orgA, MEM, "Member");
  await m(orgB, MGR_B, "Manager");
  for (const a of [MEM, PROP]) await db.query("insert into public.organization_approvers (organization_id, wallet_address) values ($1,$2)", [orgA, a]);
  await db.query(`insert into public.elections_chain (election_id_onchain, organization_id, proposer_wallet, created_at_chain, reg_end, commit_end, reveal_end,
     request_status, candidate_count, metadata_hash, metadata_version) values (0,$1,$2,now(),now(),now(),now(),'Approved',2,$3,1)`, [orgA, PROP, H(7)]);
});

test("A. schema: rang buoc du lieu (vi / hash / candidate trung / thanh vien trung)", async () => {
  await denied(db.query("insert into public.organizations (organization_id_onchain,name,verification_status,created_by) values (9,'x','Verified','0xABC')"), /wallet_address|violates/i);
  await denied(db.query("insert into public.organizations (organization_id_onchain,name,verification_status,created_by) values (9,'x','Verified',$1)", ["0x" + "A".repeat(40)]), /wallet_address|violates/i);
  await denied(db.query("insert into public.organization_members (organization_id,wallet_address,role) values ($1,$2,'Member')", [orgA, MEM])); // trung vi trong to chuc
  await db.query("insert into public.candidates_metadata (election_id_onchain,candidate_id_onchain,onchain_name,metadata_hash,metadata_version,status) values (0,0,'A',$1,1,'awaiting_content')", [H(8)]);
  await denied(db.query("insert into public.candidates_metadata (election_id_onchain,candidate_id_onchain,onchain_name,metadata_hash,metadata_version,status) values (0,0,'A2',$1,1,'awaiting_content')", [H(9)])); // trung candidate
  await denied(db.query("insert into public.organizations (organization_id_onchain,name,verification_status,created_by,logo_url) values (9,'x','Verified',$1,'javascript:alert(1)')", [MGR]));
  await db.query("delete from public.candidates_metadata");
});

test("B. nguoi chua dang nhap: chi doc du lieu cong khai, khong doc thanh vien / nhap / nonce", async () => {
  const orgs = (await rows(anon, "select name from public.organizations order by organization_id_onchain")).map((r) => r.name);
  assert.deepEqual(orgs, ["CLB A", "To chuc C (dinh chi)"]);             // Pending an
  assert.equal((await rows(anon, "select 1 from public.organization_approvers")).length, 2);
  assert.equal((await rows(anon, "select 1 from public.elections_chain")).length, 1);
  await denied(run(anon, "select 1 from public.organization_members"));
  await denied(run(anon, "select 1 from public.auth_nonces"));
  await denied(run(anon, "select 1 from public.sync_state"));
  await denied(run(anon, "insert into public.organizations (organization_id_onchain,name,verification_status,created_by) values (9,'x','Verified',$1)", [MGR]));
  await denied(run(anon, "select public.issue_wallet_nonce($1,$2,300,5)", [MGR, "a".repeat(32)]));
});

test("C. client KHONG ghi duoc vao bang mirror (to chuc, thanh vien, dai dien, election, metadata hien hanh)", async () => {
  const ctx = who(MGR);
  await denied(run(ctx, "insert into public.organizations (organization_id_onchain,name,verification_status,created_by) values (9,'x','Verified',$1)", [MGR]));
  await denied(run(ctx, "insert into public.organization_members (organization_id,wallet_address,role) values ($1,$2,'Manager')", [orgA, OUT]));   // tu nang quyen
  await denied(run(ctx, "insert into public.organization_approvers (organization_id,wallet_address) values ($1,$2)", [orgA, OUT]));
  await denied(run(ctx, "update public.organization_members set role='Manager' where wallet_address=$1", [MEM]));
  await denied(run(ctx, "delete from public.organization_approvers"));
  await denied(run(ctx, "insert into public.elections_chain (election_id_onchain,organization_id,proposer_wallet,created_at_chain,reg_end,commit_end,reveal_end,request_status,candidate_count,metadata_hash,metadata_version) values (5,$1,$2,now(),now(),now(),now(),'Approved',2,$3,1)", [orgA, MGR, H(1)]));
  await denied(run(ctx, "insert into public.elections_metadata (election_id_onchain,organization_id,metadata_hash,metadata_version,status) values (0,$1,$2,1,'verified')", [orgA, H(1)]));
  await denied(run(ctx, "insert into public.candidates_metadata (election_id_onchain,candidate_id_onchain,onchain_name,metadata_hash,metadata_version,status) values (0,0,'A',$1,1,'verified')", [H(1)]));
  assert.equal((await rows(admin, "select role from public.organization_members where wallet_address=$1", [MEM]))[0].role, "Member");
});

test("D. JWT gia: user_metadata.wallet, thieu claim, vi viet hoa, role anon deu KHONG co quyen", async () => {
  const spoof = { role: "authenticated", claims: { role: "authenticated", sub: uuidOf(50), app_metadata: {}, user_metadata: { wallet: MGR } } };
  assert.equal((await rows(spoof, "select public.auth_wallet() w"))[0].w, null);
  assert.equal((await rows(spoof, "select * from public.organization_members")).length, 0);
  assert.equal((await run(spoof, "update public.organizations set description='hack' where id=$1", [orgA])).rowCount, 0);
  const upper = who("0x" + "AB".repeat(20), 51);
  assert.equal((await rows(upper, "select public.auth_wallet() w"))[0].w, "0x" + "ab".repeat(20));  // chuan hoa ve chu thuong
  const wrongRole = { role: "authenticated", claims: { role: "anon", sub: uuidOf(52), app_metadata: { wallet: MGR } } };
  assert.equal((await rows(wrongRole, "select public.auth_wallet() w"))[0].w, null);
  const badWallet = who("0x123", 53);
  assert.equal((await rows(badWallet, "select public.auth_wallet() w"))[0].w, null);
});

test("E. to chuc: chi Manager cua DUNG to chuc sua 3 cot ngoai chuoi; khong sua cot mirror", async () => {
  const ok = await run(who(MGR), "update public.organizations set description='Mo ta CLB', organization_type='club' where id=$1", [orgA]);
  assert.equal(ok.rowCount, 1);
  await denied(run(who(MGR), "update public.organizations set name='Doi ten' where id=$1", [orgA]));
  await denied(run(who(MGR), "update public.organizations set verification_status='Verified' where id=$1", [orgB]));
  await denied(run(who(MGR), "update public.organizations set created_by=$2 where id=$1", [orgA, OUT]));
  await denied(run(who(MGR), "update public.organizations set organization_type='khong-hop-le' where id=$1", [orgA]));
  for (const c of [who(PROP), who(MEM), who(OUT), who(MGR_B)])
    assert.equal((await run(c, "update public.organizations set description='hack' where id=$1", [orgA])).rowCount, 0);
  await denied(run(anon, "update public.organizations set description='hack' where id=$1", [orgA]));
  assert.equal((await rows(admin, "select description from public.organizations where id=$1", [orgA]))[0].description, "Mo ta CLB");
  // To chuc chua Verified (Pending): Manager KHONG sua duoc mo ta (hop dong: updateOrganization la onlyManager => Verified)
  assert.equal((await run(who(MGR_B), "update public.organizations set description='x' where id=$1", [orgB])).rowCount, 0);
  // Manager to chuc B (Pending) thay duoc to chuc cua minh nhung to chuc B khong thanh vien thi khong
  assert.equal((await rows(who(MGR_B), "select 1 from public.organizations where id=$1", [orgB])).length, 1);
  assert.equal((await rows(who(OUT), "select 1 from public.organizations where id=$1", [orgB])).length, 0);
});

test("F. danh sach thanh vien: chi thanh vien cung to chuc xem", async () => {
  assert.equal((await rows(who(MEM), "select 1 from public.organization_members")).length, 3);
  assert.equal((await rows(who(MGR_B), "select 1 from public.organization_members")).length, 1);   // chi to chuc B
  assert.equal((await rows(who(OUT), "select 1 from public.organization_members")).length, 0);
});

const draft = (org, hash, wallet, over = {}) => ["insert into public.metadata_history (organization_id, metadata_type, candidate_id_onchain, metadata_hash, content, created_by) values ($1,$2,$3,$4,$5,$6)",
  [org, over.type || "election", over.cid ?? (over.type === "candidate" ? 0 : null), hash, JSON.stringify(over.content || { schema: "votechain.election.v1", title: "T" }), wallet]];

test("G. metadata_history: dung nguoi, dung vai tro, khong gia danh, khong tu danh dau da len chuoi", async () => {
  await run(who(PROP), ...draft(orgA, H(100), PROP));                              // Proposer: duoc
  await run(who(MGR), ...draft(orgA, H(101), MGR));                                // Manager: duoc
  await denied(run(who(PROP), ...draft(orgA, H(102), MGR)));                       // gui danh nghia vi khac
  await denied(run(who(MEM), ...draft(orgA, H(103), MEM)));                        // chi la Member
  await denied(run(who(OUT), ...draft(orgA, H(104), OUT)));                        // nguoi ngoai
  await denied(run(who(MGR_B), ...draft(orgB, H(105), MGR_B)));                    // to chuc chua Verified
  await denied(run(who(MGR_B), ...draft(orgA, H(106), MGR_B)));                    // Manager to chuc khac
  await denied(run(anon, ...draft(orgA, H(107), PROP)));
  await denied(run(who(PROP), "insert into public.metadata_history (organization_id,metadata_type,metadata_hash,content,created_by,onchain_seen) values ($1,'election',$2,'{}',$3,true)", [orgA, H(108), PROP]));
  await denied(run(who(PROP), "insert into public.metadata_history (organization_id,metadata_type,metadata_hash,content,created_by,transaction_hash) values ($1,'election',$2,'{}',$3,$4)", [orgA, H(109), PROP, H(1)]));
  await denied(run(who(PROP), "insert into public.metadata_history (organization_id,metadata_type,metadata_hash,content,created_by) values ($1,'election','0xabc','{}',$2)", [orgA, PROP])); // hash sai dinh dang
  await denied(run(who(PROP), "insert into public.metadata_history (organization_id,metadata_type,metadata_hash,created_by) values ($1,'election',$2,$3)", [orgA, H(110), PROP])); // khong co noi dung
  await denied(run(who(PROP), ...draft(orgA, H(111), PROP, { content: { big: "x".repeat(70000) } })));                       // > 64KB
});

test("H. metadata_history: ban nhap bat bien voi client, xoa chi ban nhap cua minh, chiem hash khong chan duoc nguoi that", async () => {
  await denied(run(who(PROP), "update public.metadata_history set content='{}' where metadata_hash=$1", [H(100)]));
  await denied(run(who(MGR), "update public.metadata_history set onchain_seen=true where metadata_hash=$1", [H(101)]));
  assert.equal((await run(who(MGR), "delete from public.metadata_history where metadata_hash=$1", [H(100)])).rowCount, 0); // khong xoa duoc ban nhap nguoi khac
  assert.equal((await run(who(PROP), "delete from public.metadata_history where metadata_hash=$1", [H(100)])).rowCount, 1);
  // "Chiem" hash: nguoi khac gui rac voi cung hash KHONG chan duoc tac gia that gui noi dung that
  await run(who(MGR), ...draft(orgA, H(120), MGR, { content: { rac: true } }));
  await run(who(PROP), ...draft(orgA, H(120), PROP));
  await denied(run(who(PROP), ...draft(orgA, H(120), PROP)));                      // cung nguoi + cung hash + cung loai: trung
  await run(who(PROP), ...draft(orgA, H(120), PROP, { type: "candidate" }));      // khac loai: duoc
});

test("I. metadata_history: ban nhap chi nguoi gui / Proposer, Manager cua to chuc thay; hang da len chuoi la cong khai", async () => {
  assert.equal((await rows(who(PROP), "select 1 from public.metadata_history where metadata_hash=$1", [H(101)])).length, 1); // ban nhap cua Manager, Proposer cung org thay
  for (const c of [who(OUT), who(MEM), anon]) assert.equal((await rows(c, "select 1 from public.metadata_history where not onchain_seen")).length, 0);
  await db.query(`insert into public.metadata_history (organization_id, election_id_onchain, metadata_type, metadata_hash, metadata_version, content, transaction_hash, onchain_seen, content_valid, created_by)
                  values ($1,0,'election',$2,1,'{"schema":"votechain.election.v1"}',$3,true,true,$4)`, [orgA, H(7), H(900), PROP]);
  assert.equal((await rows(anon, "select 1 from public.metadata_history where onchain_seen")).length, 1);
  await denied(db.query(`insert into public.metadata_history (organization_id, metadata_type, metadata_hash, content, onchain_seen) values ($1,'election',$2,'{}',true)`, [orgA, H(7)])); // hang su kien thieu election/version/tx
});

test("J. han che 200 ban nhap chua len chuoi moi vi", async () => {
  const c = who(MGR_B2());
  function MGR_B2() { return w(77); }
  await db.query("insert into public.organization_members (organization_id, wallet_address, role) values ($1,$2,'Proposer')", [orgA, w(77)]);
  const existing = Number((await rows(admin, "select count(*)::int n from public.metadata_history where created_by=$1 and not onchain_seen", [w(77)]))[0].n);
  for (let i = existing; i < 200; i++) await run(c, ...draft(orgA, H(5000 + i), w(77)));
  await denied(run(c, ...draft(orgA, H(9999), w(77))), /toi da 200/);
});

test("K. nonce dang nhap: phat hanh, tieu thu mot lan (chong replay), het han, sai vi, gioi han toc do, chi service_role", async () => {
  const n1 = "a".repeat(32);
  const r = (await rows(service, "select * from public.issue_wallet_nonce($1,$2,300,5)", [MGR, n1]))[0];
  assert.equal(r.wallet_address, MGR);
  assert.equal((await rows(service, "select * from public.consume_wallet_nonce($1,$2)", [OUT, n1])).length, 0);       // sai vi
  assert.equal((await rows(service, "select * from public.consume_wallet_nonce($1,$2)", [MGR, n1])).length, 1);       // lan 1: duoc
  assert.equal((await rows(service, "select * from public.consume_wallet_nonce($1,$2)", [MGR, n1])).length, 0);       // lan 2 (replay): that bai
  await db.query("insert into public.auth_nonces (wallet_address, nonce, issued_at, expires_at) values ($1,$2, now() - interval '10 minutes', now() - interval '5 minutes')", [MGR, "b".repeat(32)]);
  assert.equal((await rows(service, "select * from public.consume_wallet_nonce($1,$2)", [MGR, "b".repeat(32)])).length, 0); // het han
  // Spam KHONG khoa duoc nguoi khac: moi vi chi giu toi da 5 nonce con hieu luc (loai cai cu nhat), khong tu choi cap moi.
  const mk = (i) => i.toString(16).padStart(32, "c");
  for (let i = 0; i < 12; i++) await run(service, "select * from public.issue_wallet_nonce($1,$2,300,5)", [OUT, mk(i)]);
  const live = await rows(admin, "select nonce from public.auth_nonces where wallet_address=$1 and used_at is null and expires_at > now()", [OUT]);
  assert.equal(live.length, 5);
  assert.equal((await rows(service, "select * from public.consume_wallet_nonce($1,$2)", [OUT, mk(0)])).length, 0);   // nonce cu da bi loai
  assert.equal((await rows(service, "select * from public.consume_wallet_nonce($1,$2)", [OUT, mk(11)])).length, 1);  // nonce moi nhat dung duoc
  // vi nan nhan van lay duoc nonce ngay sau khi ke khac spam vi do
  for (let i = 0; i < 30; i++) await run(service, "select * from public.issue_wallet_nonce($1,$2,300,5)", [MGR_B, mk(100 + i)]);
  assert.equal((await rows(service, "select * from public.issue_wallet_nonce($1,$2,300,5)", [MEM, mk(500)])).length, 1);
  await denied(run(service, "select * from public.issue_wallet_nonce($1,$2,1,5)", [OUT, mk(501)]), /Tham so nonce/);       // ttl qua ngan
  await denied(run(service, "select * from public.issue_wallet_nonce($1,$2,99999,5)", [OUT, mk(502)]), /Tham so nonce/);   // ttl qua dai
  await db.query("insert into public.auth_nonces (wallet_address, nonce, issued_at, expires_at) values ($1,$2, now() - interval '3 hours', now() - interval '2 hours')", [MGR, mk(600)]);
  await run(service, "select * from public.issue_wallet_nonce($1,$2,300,5)", [MGR, mk(601)]);                              // don nonce het han lau
  assert.equal((await rows(admin, "select 1 from public.auth_nonces where nonce=$1", [mk(600)])).length, 0);
  await denied(run(who(MGR), "select * from public.consume_wallet_nonce($1,$2)", [MGR, "e".repeat(32)]));                 // client khong goi duoc
  await denied(db.query("insert into public.auth_nonces (wallet_address, nonce, expires_at) values ($1,'xyz',now())", [MGR]));  // dinh dang nonce
  assert.equal(Number((await rows(service, "select public.purge_expired_nonces() n"))[0].n) >= 0, true);
});

// ---------------- Storage
const sha = (n) => "0x" + n.toString(16).padStart(64, "0");
const put = (ctx, bucket, name, n = 1) => run(ctx, "insert into storage.objects (bucket_id, name, owner_id) values ($1,$2,$3)", [bucket, name, uuidOf(n)]);

test("L. Storage: buckets cau hinh dung (cong khai, gioi han dung luong, MIME)", async () => {
  const b = await rows(admin, "select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id");
  assert.deepEqual(b.map((x) => x.id), ["candidate-assets", "election-assets", "organization-assets"]);
  assert.ok(b.every((x) => x.public === true));
  assert.equal(Number(b.find((x) => x.id === "organization-assets").file_size_limit), 2 * 1024 * 1024);
  assert.ok(!b.find((x) => x.id === "organization-assets").allowed_mime_types.includes("application/pdf"));
  assert.ok(b.find((x) => x.id === "candidate-assets").allowed_mime_types.includes("application/pdf"));
});

test("M. Storage: dung to chuc + dung vai tro + dung duong dan moi duoc tai len", async () => {
  await put(who(MGR, 1), "organization-assets", `1/logo/${sha(1)}.png`);               // Manager, logo
  await put(who(PROP, 2), "election-assets", `1/cover/${sha(2)}.jpg`, 2);               // Proposer, anh bia
  await put(who(PROP, 2), "election-assets", `1/document/${sha(3)}.pdf`, 2);
  await put(who(PROP, 2), "candidate-assets", `1/avatar/${sha(4)}.webp`, 2);
  await denied(put(who(PROP, 2), "organization-assets", `1/logo/${sha(5)}.png`, 2));    // Proposer khong sua logo to chuc
  await denied(put(who(MEM, 3), "candidate-assets", `1/avatar/${sha(6)}.png`, 3));      // Member khong tai
  await denied(put(who(OUT, 4), "election-assets", `1/cover/${sha(7)}.png`, 4));        // nguoi ngoai
  await denied(put(who(MGR_B, 5), "election-assets", `1/cover/${sha(8)}.png`, 5));      // Manager to chuc khac, ghi vao thu muc to chuc 1
  await denied(put(who(MGR_B, 5), "election-assets", `2/cover/${sha(9)}.png`, 5));      // to chuc 2 chua Verified
  await denied(put(anon, "election-assets", `1/cover/${sha(10)}.png`));
});

test("N. Storage: duong dan sai bi chan (traversal, duoi file, checksum sai dinh dang, bucket/loai khong khop, ten trung id)", async () => {
  const bad = [
    ["organization-assets", `1/logo/${sha(11)}.pdf`],            // pdf khong hop le cho logo
    ["organization-assets", `1/logo/../2/logo/${sha(12)}.png`],  // traversal
    ["organization-assets", `1/logo/logo.png`],                  // khong co checksum
    ["organization-assets", `1/logo/0x${"A".repeat(64)}.png`], // checksum viet hoa
    ["organization-assets", `01/logo/${sha(14)}.png`],           // id co so 0 dau
    ["organization-assets", `1/avatar/${sha(15)}.png`],          // sai loai cho bucket
    ["candidate-assets", `1/cover/${sha(16)}.png`],
    ["election-assets", `1/cover/${sha(17)}.pdf`],               // anh bia khong duoc la pdf
    ["election-assets", `1/cover/${sha(18)}.png/extra`],
    ["election-assets", `/1/cover/${sha(19)}.png`],
    ["other-bucket", `1/cover/${sha(20)}.png`],
  ];
  for (const [b, n] of bad) await denied(put(who(MGR, 1), b, n), /./);
});

test("O. Storage: khong ghi de / doi ten (khong co UPDATE), xoa chi file cua minh", async () => {
  await db.query("insert into storage.buckets values ('other-bucket','other-bucket',true,null,null) on conflict do nothing");
  assert.equal((await run(who(MGR, 1), "update storage.objects set name=$1 where bucket_id='organization-assets'", [`1/logo/${sha(30)}.png`])).rowCount, 0);
  assert.equal((await run(who(MGR, 99), "delete from storage.objects where bucket_id='organization-assets'")).rowCount, 0);  // nguoi khac
  assert.equal((await run(who(MGR, 1), "delete from storage.objects where bucket_id='organization-assets'")).rowCount, 1);   // chinh chu
  await run(who(MGR, 1), "insert into storage.objects (bucket_id,name,owner_id) values ('organization-assets',$1,$2)", [`1/logo/${sha(31)}.png`, uuidOf(1)]);
  await db.query("insert into public.organization_members (organization_id, wallet_address, role) values ($1,$2,'Member') on conflict do nothing", [orgA, w(8)]);
  // go quyen Manager thi mat luon quyen xoa
  await db.query("update public.organization_members set membership_status='removed' where wallet_address=$1", [MGR]);
  assert.equal((await run(who(MGR, 1), "delete from storage.objects where bucket_id='organization-assets'")).rowCount, 0);
  await db.query("update public.organization_members set membership_status='active' where wallet_address=$1", [MGR]);
});

test("P. thanh vien bi go (membership_status = removed) mat quyen ngay lap tuc o RLS", async () => {
  await db.query("update public.organization_members set membership_status='removed' where wallet_address=$1", [PROP]);
  await denied(run(who(PROP, 2), ...draft(orgA, H(777), PROP)));
  assert.equal((await rows(who(PROP, 2), "select 1 from public.organization_members")).length, 0);
  await db.query("update public.organization_members set membership_status='active' where wallet_address=$1", [PROP]);
});

test("Q. service_role (Edge Function) ghi duoc bang mirror va khong bi RLS chan", async () => {
  const r = await run(service, "insert into public.organizations (organization_id_onchain,name,verification_status,created_by) values (50,'Do chain-sync them','Verified',$1) returning id", [w(60)]);
  assert.equal(r.rowCount, 1);
  await run(service, "update public.sync_state set last_block = 123, last_run_at = now() where id = 1");
  assert.equal(Number((await rows(service, "select last_block from public.sync_state"))[0].last_block), 123);
});

test("R. Chong cheo to chuc: thanh vien A khong doc / sua / ghi du lieu to chuc D (hai to chuc deu Verified) va nguoc lai", async () => {
  const DM = w(20), DP = w(21), DMEM = w(22);
  const orgD = (await db.query("insert into public.organizations (organization_id_onchain,name,verification_status,created_by) values (4,'CLB D','Verified',$1) returning id", [DM])).rows[0].id;
  for (const [wa, r] of [[DM, "Manager"], [DP, "Proposer"], [DMEM, "Member"]]) await db.query("insert into public.organization_members (organization_id,wallet_address,role) values ($1,$2,$3)", [orgD, wa, r]);
  await run(who(DP, 21), ...draft(orgD, H(3001), DP));                                         // ban nhap cua D
  await run(who(DM, 20), ...draft(orgD, H(3002), DM));
  const A = [[who(MGR, 1), "Manager A"], [who(PROP, 2), "Proposer A"], [who(MEM, 3), "Member A"]];
  for (const [ctx, label] of A) {
    // doc: khong thay thanh vien D, khong thay ban nhap D
    assert.equal((await rows(ctx, "select 1 from public.organization_members where organization_id=$1", [orgD])).length, 0, label + " thay thanh vien D");
    assert.equal((await rows(ctx, "select 1 from public.metadata_history where organization_id=$1 and not onchain_seen", [orgD])).length, 0, label + " thay ban nhap D");
    // sua mo ta D
    assert.equal((await run(ctx, "update public.organizations set description='tan cong' where id=$1", [orgD])).rowCount, 0, label + " sua duoc D");
    // gui ban nhap vao D (ca khi doi created_by thanh vi cua minh)
    await denied(run(ctx, ...draft(orgD, H(3100 + A.indexOf(A.find((x) => x[1] === label))), ctx.claims.app_metadata.wallet)));
    // xoa ban nhap cua D
    assert.equal((await run(ctx, "delete from public.metadata_history where organization_id=$1", [orgD])).rowCount, 0, label + " xoa duoc ban nhap D");
    // tai len thu muc cua D (org on-chain = 4)
    await denied(put(ctx, "election-assets", `4/cover/${sha(3200)}.png`, ctx.claims.sub.endsWith("1") ? 1 : 2), /./);
    await denied(put(ctx, "organization-assets", `4/logo/${sha(3201)}.png`, 1), /./);
  }
  // chieu nguoc: Manager D khong dung duoc to chuc A
  const D = who(DM, 20);
  assert.equal((await run(D, "update public.organizations set description='tan cong' where id=$1", [orgA])).rowCount, 0);
  assert.equal((await rows(D, "select 1 from public.organization_members where organization_id=$1", [orgA])).length, 0);
  await denied(run(D, ...draft(orgA, H(3300), DM)));
  await denied(put(D, "organization-assets", `1/logo/${sha(3301)}.png`, 20), /./);
  // Cac thanh vien D van lam dung viec cua minh
  await run(D, ...draft(orgD, H(3302), DM));
  await put(D, "organization-assets", `4/logo/${sha(3303)}.png`, 20);
  // File D vua tai len: Manager A khong xoa duoc
  assert.equal((await run(who(MGR, 1), "delete from storage.objects where bucket_id='organization-assets' and name like '4/%'")).rowCount, 0);
  // Nguoi dung co wallet o CA HAI to chuc chi co quyen theo tung to chuc
  const both = w(30);
  await db.query("insert into public.organization_members (organization_id,wallet_address,role) values ($1,$2,'Member'),($3,$2,'Proposer')", [orgA, both, orgD]);
  await denied(run(who(both, 30), ...draft(orgA, H(3400), both)));       // chi la Member o A
  await run(who(both, 30), ...draft(orgD, H(3401), both));               // Proposer o D
});


test("S. metadata_history: ung vien <=> co candidate_id; cuoc bau cu <=> khong co (ban nhap VA hang su kien)", async () => {
  const ins = (ctx, type, cid, hash, extra = "") => run(ctx, `insert into public.metadata_history (organization_id, metadata_type, candidate_id_onchain, metadata_hash, content, created_by) values ($1,$2,$3,$4,'{"a":1}',$5)`, [orgA, type, cid, hash, ctx.claims.app_metadata.wallet]);
  await ins(who(PROP, 2), "candidate", 0, H(4001));                         // dung
  await ins(who(PROP, 2), "candidate", 19, H(4002));                        // bien tren
  await ins(who(PROP, 2), "election", null, H(4003));                       // dung
  await denied(ins(who(PROP, 2), "candidate", null, H(4004)));              // ung vien thieu id
  await denied(ins(who(PROP, 2), "election", 0, H(4005)));                  // cuoc bau cu co id
  await denied(ins(who(PROP, 2), "candidate", 20, H(4006)));                // ngoai khoang 0..19
  await denied(ins(who(PROP, 2), "candidate", -1, H(4007)));
  // hang su kien do chain-sync (service_role) tao cung phai theo quy tac
  const ev = (type, cid, v) => run(service, `insert into public.metadata_history (organization_id, election_id_onchain, candidate_id_onchain, metadata_type, metadata_hash, metadata_version, content, transaction_hash, onchain_seen)
     values ($1,0,$2,$3,$4,$5,'{"a":1}',$6,true)`, [orgA, cid, type, H(4100 + v), v, H(4200 + v)]);
  await ev("election", null, 11); await ev("candidate", 0, 12); await ev("candidate", 1, 13);
  await denied(ev("candidate", null, 14)); await denied(ev("election", 1, 15));
  // cung ban nhap cho hai ung vien khac nhau cua cung mot tac gia khong tranh nhau (chi muc duy nhat co candidate_id)
  await ins(who(PROP, 2), "candidate", 1, H(4001));
  await denied(ins(who(PROP, 2), "candidate", 1, H(4001)));                 // trung hoan toan
});

test("T. Gioi han 200 ban nhap: chi ap dung client; tu choi gia danh created_by; khong anh huong service_role", async () => {
  const WA = w(40), WB = w(41);
  for (const x of [WA, WB]) await db.query("insert into public.organization_members (organization_id, wallet_address, role) values ($1,$2,'Proposer')", [orgA, x]);
  // service_role / chain-sync: khong bi gioi han (250 ban nhap + 250 hang su kien cho cung vi)
  await db.query(`insert into public.metadata_history (organization_id, metadata_type, metadata_hash, content, created_by)
                  select $1, 'election', '0x' || lpad(to_hex(g + 700000), 64, '0'), '{"a":1}', $2 from generate_series(1, 250) g`, [orgA, WA]);
  assert.equal(Number((await rows(service, "select count(*)::int n from public.metadata_history where created_by=$1 and not onchain_seen", [WA]))[0].n), 250);
  await run(service, `insert into public.metadata_history (organization_id, election_id_onchain, metadata_type, metadata_hash, metadata_version, content, transaction_hash, onchain_seen, created_by)
                      values ($1,0,'election',$2,99,'{"a":1}',$3,true,$4)`, [orgA, H(800001), H(800002), WA]);           // khong bi chan du WA da qua 200
  // client WA da vuot 200 -> bi chan; client WB (0 ban nhap) khong bi anh huong
  await denied(run(who(WA, 40), ...draft(orgA, H(800003), WA)), /toi da 200/);
  await run(who(WB, 41), ...draft(orgA, H(800004), WB));
  // gia danh created_by: bi chan NGAY o trigger (khong de lo so luong ban nhap cua WA, khong lay khoa cua WA)
  await denied(run(who(WB, 41), ...draft(orgA, H(800005), WA)), /row-level security/);
  await denied(run(who(WB, 41), "insert into public.metadata_history (organization_id,metadata_type,metadata_hash,content,created_by,onchain_seen,election_id_onchain,metadata_version,transaction_hash) values ($1,'election',$2,'{}',$3,true,0,1,$4)", [orgA, H(800006), WB, H(1)]), /permission denied|row-level security/);   // cot onchain_seen khong co quyen INSERT
  // xoa ban nhap cua chinh minh lam giam so dem
  assert.equal((await run(who(WB, 41), "delete from public.metadata_history where created_by=$1", [WB])).rowCount, 1);
});

test("U. Nonce theo NGUOI GOI: ke tan cong khong khoa duoc nan nhan; tham so khong hop le bi chan", async () => {
  const VICTIM = w(50), ATK = "a".repeat(32), OK = "b".repeat(32);
  const iss = (nonce, req, maxRecent = 10, maxReq = 5) => run(service, "select * from public.issue_wallet_nonce($1,$2,300,$3,$4,$5)", [VICTIM, nonce, maxRecent, req, maxReq]);
  const nn = (i) => "d" + i.toString(16).padStart(31, "0");
  const victim1 = (await iss(nn(0), OK)).rows[0].nonce;                                // nan nhan lay nonce truoc
  for (let i = 1; i <= 5; i++) await iss(nn(i), ATK);                                 // ke tan cong: 5 nonce/phut/vi la toi da
  await denied(iss(nn(6), ATK), /Qua nhieu/);                                         // nonce thu 6 tu cung nguoi goi bi tu choi
  assert.equal((await iss(nn(7), OK)).rowCount, 1);                                   // nan nhan o nguon khac van duoc cap
  assert.equal((await rows(service, "select * from public.consume_wallet_nonce($1,$2)", [VICTIM, victim1])).length, 1);   // nonce dau cua nan nhan van dung duoc
  // nguoi goi khac nhau khong dung chung bo dem; cung nguoi goi nhung vi khac cung khong
  assert.equal((await run(service, "select * from public.issue_wallet_nonce($1,$2,300,10,$3,5)", [w(51), nn(8), ATK])).rowCount, 1);
  // khong co requester: van bi chan boi tran so nonce theo vi
  for (let i = 20; i < 40; i++) await run(service, "select * from public.issue_wallet_nonce($1,$2,300,3)", [w(52), nn(i)]);
  assert.equal(Number((await rows(admin, "select count(*)::int n from public.auth_nonces where wallet_address=$1 and used_at is null", [w(52)]))[0].n), 3);
  for (const bad of [[30 - 1, 5, 5], [300, 0, 5], [300, 51, 5], [300, 5, 0], [300, 5, 1001], [901, 5, 5]])
    await denied(run(service, "select * from public.issue_wallet_nonce($1,$2,$3,$4,$5,$6)", [w(53), nn(90), bad[0], bad[1], ATK, bad[2]]), /Tham so nonce/);
  await denied(run(service, "select * from public.issue_wallet_nonce($1,$2,300,5,'KHONG-PHAI-HEX',5)", [w(53), nn(91)]));        // dinh dang requester
  // requester la bam, khong phai IP tho
  const rq = (await rows(admin, "select requester from public.auth_nonces where requester is not null limit 1"))[0].requester;
  assert.match(rq, /^[0-9a-f]{16,64}$/);
});

test("V. Kiem toan quyen: ma tran GRANT, RLS bat, ham SECURITY DEFINER co search_path rong, EXECUTE toi thieu", async () => {
  const tables = (await rows(admin, "select c.relname t, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1")).map((r) => r);
  assert.equal(tables.length, 9);
  assert.ok(tables.every((t) => t.rls === true), "bang thieu RLS: " + tables.filter((t) => !t.rls).map((t) => t.t));
  const cols = await rows(admin, `select c.relname t, a.attname col from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
                                  where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped`);
  const priv = async (role, t, col, p) => (await rows(admin, "select has_column_privilege($1, ('public.'||$2)::regclass, $3, $4) ok", [role, t, col, p]))[0].ok;
  const tpriv = async (role, t, p) => (await rows(admin, "select has_table_privilege($1, ('public.'||$2)::regclass, $3) ok", [role, t, p]))[0].ok;
  const SELECT_ANON = ["organizations", "organization_approvers", "elections_chain", "elections_metadata", "candidates_metadata", "metadata_history"];
  const SELECT_AUTH = [...SELECT_ANON, "organization_members"];
  const INS_COLS = ["organization_id", "metadata_type", "candidate_id_onchain", "metadata_hash", "content", "created_by"];
  const UPD_COLS = ["description", "logo_url", "organization_type"];
  for (const { t } of tables) {
    for (const p of ["TRUNCATE", "REFERENCES", "TRIGGER"]) for (const r of ["anon", "authenticated"]) assert.equal(await tpriv(r, t, p), false, `${r} co ${p} tren ${t}`);
    assert.equal(await tpriv("anon", t, "SELECT"), SELECT_ANON.includes(t), `anon SELECT ${t}`);
    assert.equal(await tpriv("authenticated", t, "SELECT"), SELECT_AUTH.includes(t), `authenticated SELECT ${t}`);
    for (const p of ["INSERT", "UPDATE", "DELETE"]) assert.equal(await tpriv("anon", t, p), false, `anon ${p} ${t}`);
    assert.equal(await tpriv("authenticated", t, "DELETE"), t === "metadata_history", `authenticated DELETE ${t}`);
    assert.equal(await tpriv("authenticated", t, "INSERT"), false, `authenticated INSERT toan bang ${t}`);
    assert.equal(await tpriv("authenticated", t, "UPDATE"), false, `authenticated UPDATE toan bang ${t}`);
  }
  for (const { t, col } of cols) {            // quyen THEO COT cua authenticated dung bang danh sach cho phep, khong thua mot cot nao
    assert.equal(await priv("authenticated", t, col, "INSERT"), t === "metadata_history" && INS_COLS.includes(col), `INSERT ${t}.${col}`);
    assert.equal(await priv("authenticated", t, col, "UPDATE"), t === "organizations" && UPD_COLS.includes(col), `UPDATE ${t}.${col}`);
    assert.equal(await priv("anon", t, col, "INSERT"), false); assert.equal(await priv("anon", t, col, "UPDATE"), false);
  }
  const fns = await rows(admin, `select p.proname n, p.prosecdef def, p.proconfig cfg,
       has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u, has_function_privilege('service_role', p.oid, 'EXECUTE') s
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by 1`);
  const CLIENT_OK = ["auth_wallet", "has_org_role", "has_org_role_onchain", "org_is_verified", "can_write_asset"];
  assert.equal(fns.length, 11);
  for (const f of fns) {
    assert.ok((f.cfg || []).some((c) => /^search_path=("")?$|^search_path=""$|^search_path=$/.test(c) || c.replace(/\s/g, "") === 'search_path=""'), `${f.n} thieu search_path rong: ${JSON.stringify(f.cfg)}`);
    assert.equal(f.a, CLIENT_OK.includes(f.n), `anon EXECUTE ${f.n}`);
    assert.equal(f.u, CLIENT_OK.includes(f.n), `authenticated EXECUTE ${f.n}`);
    assert.equal(f.s, true, `service_role EXECUTE ${f.n}`);
  }
  const defs = fns.filter((f) => f.def).map((f) => f.n).sort();
  assert.deepEqual(defs, ["consume_wallet_nonce", "has_org_role", "has_org_role_onchain", "issue_wallet_nonce", "org_is_verified", "purge_expired_nonces"]);
  // PUBLIC khong con quyen EXECUTE tren cac ham nhay cam
  const pub = await rows(admin, `select p.proname n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.prokind='f' and p.proname = any($1) and has_function_privilege('public', p.oid, 'EXECUTE')`, [["issue_wallet_nonce", "consume_wallet_nonce", "purge_expired_nonces", "limit_metadata_drafts"]]);
  assert.deepEqual(pub, []);
});

test("W. Storage: khong ghi de (upsert), khong doi ten / chuyen thu muc / chuyen bucket, khong sao chep vao to chuc khac", async () => {
  const mgr = who(MGR, 1), other = who(MGR_B, 5);
  const name = `1/logo/${sha(7001)}.png`;
  await put(mgr, "organization-assets", name, 1);
  // upsert (ON CONFLICT DO UPDATE) len file da co: bi tu choi vi khong co policy UPDATE
  await denied(run(mgr, "insert into storage.objects (bucket_id,name,owner_id) values ('organization-assets',$1,$2) on conflict (bucket_id,name) do update set owner_id = excluded.owner_id", [name, uuidOf(1)]));
  // nguoi khac ghi de len ten do
  await denied(run(other, "insert into storage.objects (bucket_id,name,owner_id) values ('organization-assets',$1,$2) on conflict (bucket_id,name) do update set owner_id = excluded.owner_id", [name, uuidOf(5)]));
  // doi ten / chuyen thu muc / chuyen bucket (Storage move = UPDATE): 0 dong bi anh huong, du la chu file
  for (const sql of ["update storage.objects set name = '2/logo/x.png' where name = $1", "update storage.objects set bucket_id = 'election-assets' where name = $1",
                     "update storage.objects set owner_id = 'ke-khac' where name = $1"])
    assert.equal((await run(mgr, sql, [name])).rowCount, 0, sql);
  // sao chep vao thu muc to chuc khac (Storage copy = INSERT vao dich): dich phai qua can_write_asset
  await denied(run(mgr, "insert into storage.objects (bucket_id,name,owner_id) select bucket_id, '2/logo/' || split_part(name,'/',3), owner_id from storage.objects where name=$1", [name]));
  // nguoi khac khong xoa duoc, chu file xoa duoc
  assert.equal((await run(other, "delete from storage.objects where name=$1", [name])).rowCount, 0);
  assert.equal((await run(who(MGR, 99), "delete from storage.objects where name=$1", [name])).rowCount, 0);   // cung Manager nhung khong phai chu file (owner_id khac)
  assert.equal((await run(mgr, "delete from storage.objects where name=$1", [name])).rowCount, 1);
  // owner_id rong (loi phia API) -> xoa bi tu choi (dong an toan)
  await db.query("insert into storage.objects (bucket_id,name,owner_id) values ('organization-assets',$1,null)", [`1/logo/${sha(7002)}.png`]);
  assert.equal((await run(mgr, "delete from storage.objects where name=$1", [`1/logo/${sha(7002)}.png`])).rowCount, 0);
});

test("X. Storage: bucket cong khai chi nhan dung loai file; moi duong dan hop le deu nam trong thu muc to chuc cua nguoi tai", async () => {
  const names = (await rows(admin, "select b.id, b.public, b.allowed_mime_types m, b.file_size_limit l from storage.buckets b where b.id <> 'other-bucket' order by 1"));
  assert.deepEqual(names.map((b) => b.id), ["candidate-assets", "election-assets", "organization-assets"]);
  for (const b of names) { assert.equal(b.public, true); assert.ok(b.l > 0 && b.l <= 10 * 1024 * 1024); assert.ok(!b.m.some((t) => /html|svg|javascript|octet|zip/i.test(t)), "MIME nguy hiem trong " + b.id); }
  // mọi duong dan ghi duoc deu ep dung quy tac: kiem tra truc tiep ham voi du lieu bien
  const ok = async (b, n) => (await rows(who(MGR, 1), "select public.can_write_asset($1,$2) ok", [b, n]))[0].ok;
  assert.equal(await ok("organization-assets", `1/logo/${sha(8001)}.webp`), true);
  assert.equal(await ok("organization-assets", `1/logo/${sha(8001)}.svg`), false);       // svg co the chua script
  assert.equal(await ok("election-assets", `1/document/${sha(8002)}.html`), false);
  assert.equal(await ok("election-assets", `1/cover/${sha(8003)}.png\n`), false);        // ky tu xuong dong chen sau duoi
  assert.equal(await ok("election-assets", `1/cover/${sha(8003)}.png%00.html`), false);
  assert.equal(await ok("election-assets", `999999999999999999999/cover/${sha(8004)}.png`), false);   // id qua dai (chong tran so ::bigint)
  assert.equal(await ok("election-assets", `0/cover/${sha(8005)}.png`), false);          // id = 0 khong ton tai
});

test.after(async () => { await db.close(); });
