// Kiem thu TRUY CAP DONG THOI tren PostgreSQL THAT (nhieu ket noi), vi PGlite chi co mot ket noi nen khong chung minh duoc race condition.
//
// Dieu kien: npm i --no-save embedded-postgres pg   (tai ban PostgreSQL that ~ vai chuc MB) va KHONG chay bang root
// (initdb tu choi root). Neu thieu, bo test nay tu bo qua kem ly do. Chay:  node --test supabase/tests/concurrency.test.js
//
// Cach chung minh khoa co tac dung: moi tinh huong chay 3 ban:
//   (a) ham that (co khoa)                       -> phai dung gioi han tuyet doi
//   (b) ham that + pg_sleep chen vao khe race    -> van phai dung gioi han (khoa chiu duoc cua so race bi keo dai)
//   (c) ham BO khoa + pg_sleep                   -> phai VUOT gioi han (chung minh test du nhay de bat loi)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const net = require("node:net");
const path = require("node:path");

let EmbeddedPostgres, Client, skipReason = null;
try { EmbeddedPostgres = require("embedded-postgres").default; Client = require("pg").Client; } catch { skipReason = "thieu embedded-postgres / pg (npm i --no-save embedded-postgres pg)"; }
if (!skipReason && process.getuid && process.getuid() === 0) skipReason = "initdb khong chay duoc voi quyen root";

const DIR = path.join(__dirname, "..");
const w = (n) => "0x" + n.toString(16).padStart(40, "0");
const H = (n) => "0x" + n.toString(16).padStart(64, "0");
const nn = (i) => i.toString(16).padStart(32, "0");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pgsrv, port, dataDir, admin, orgId;

const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const connect = async () => { const c = new Client({ host: "127.0.0.1", port, user: "postgres", password: "pw", database: "postgres" }); await c.connect(); return c; };

/** Chay mot truy van trong giao dich rieng voi vai tro + JWT cho truoc; tra {ok, rows} hoac {err: code}. */
async function asRole(role, claims, sql, params = []) {
  const c = await connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims || {})]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return { ok: true, rows: r.rows };
  } catch (e) { try { await c.query("rollback"); } catch {} return { ok: false, code: e.code, msg: e.message }; }
  finally { await c.end(); }
}
const authClaims = (wallet, n) => ({ role: "authenticated", sub: "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0"), app_metadata: { wallet } });

/** Tao ban sao cua ham de thay doi (bo khoa / chen sleep) ma khong sua migration. */
async function variant(sig, newName, edit) {
  const def = (await admin.query("select pg_get_functiondef($1::regprocedure) d", [sig])).rows[0].d;
  const base = sig.slice(0, sig.indexOf("(")).replace("public.", "");
  const out = edit(def.replace(`public.${base}(`, `public.${newName}(`));
  assert.notEqual(out, def);
  await admin.query(out);
}
const noLock = (d) => d.replace(/\s*perform pg_advisory_xact_lock\([^;]*\);/g, "");

test.before(async () => {
  if (skipReason) return;
  port = await freePort();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "votechain-pg-"));
  pgsrv = new EmbeddedPostgres({ databaseDir: path.join(dataDir, "data"), user: "postgres", password: "pw", port, persistent: false });
  await pgsrv.initialise(); await pgsrv.start();
  admin = await connect();
  await admin.query(fs.readFileSync(path.join(DIR, "tests/stubs.sql"), "utf8"));
  for (const f of fs.readdirSync(path.join(DIR, "migrations")).sort()) await admin.query(fs.readFileSync(path.join(DIR, "migrations", f), "utf8"));
  orgId = (await admin.query("insert into public.organizations (organization_id_onchain,name,verification_status,created_by) values (1,'CLB','Verified',$1) returning id", [w(1)])).rows[0].id;
});
test.after(async () => {
  if (skipReason) return;
  try { await admin.end(); } catch {}
  try { await pgsrv.stop(); } catch {}
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const T = (name, fn) => test(name, { skip: skipReason || false, timeout: 120000 }, fn);

T("Migration chay tren PostgreSQL that (khong phai PGlite)", async () => {
  const v = (await admin.query("select version() v")).rows[0].v;
  assert.match(v, /^PostgreSQL \d+/);
  assert.ok(Number(v.match(/PostgreSQL (\d+)/)[1]) >= 14);
  assert.equal(Number((await admin.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity")).rows[0].n), 9);
});

T("Nonce: 30 request dong thoi cho CUNG MOT vi khong vuot p_max_recent (co khoa); ban bo khoa thi vuot", async () => {
  await variant("public.issue_wallet_nonce(text,text,int,int,text,int)", "issue_nonce_locked_slow", (d) => d.replace("insert into public.auth_nonces (wallet_address, nonce, expires_at, requester)", "perform pg_sleep(0.15);\n  insert into public.auth_nonces (wallet_address, nonce, expires_at, requester)"));
  await variant("public.issue_wallet_nonce(text,text,int,int,text,int)", "issue_nonce_unlocked_slow", (d) => noLock(d).replace("insert into public.auth_nonces (wallet_address, nonce, expires_at, requester)", "perform pg_sleep(0.15);\n  insert into public.auth_nonces (wallet_address, nonce, expires_at, requester)"));
  const live = async (wallet) => Number((await admin.query("select count(*)::int n from public.auth_nonces where wallet_address=$1 and used_at is null and expires_at > now()", [wallet])).rows[0].n);
  const burst = (fn, wallet, base) => Promise.all(Array.from({ length: 30 }, (_, i) => asRole("service_role", {}, `select * from public.${fn}($1,$2,300,5)`, [wallet, nn(base + i)])));

  const A = await burst("issue_wallet_nonce", w(100), 1000);           // (a) ham that
  assert.ok(A.every((r) => r.ok), JSON.stringify(A.find((r) => !r.ok)));
  assert.equal(await live(w(100)), 5);
  const B = await burst("issue_nonce_locked_slow", w(101), 2000);      // (b) co khoa + cua so race keo dai
  assert.ok(B.every((r) => r.ok), JSON.stringify(B.find((r) => !r.ok)));
  assert.equal(await live(w(101)), 5);
  await burst("issue_nonce_unlocked_slow", w(102), 3000);              // (c) khong khoa -> phai vuot
  assert.ok(await live(w(102)) > 5, "ban khong khoa phai vuot gioi han, neu khong test khong du nhay");
});

T("Nonce: gioi han theo nguoi goi chinh xac duoi tai dong thoi (20 request, toi da 5 duoc cap)", async () => {
  const req = "ab".repeat(16);
  const R = await Promise.all(Array.from({ length: 20 }, (_, i) => asRole("service_role", {}, "select * from public.issue_wallet_nonce($1,$2,300,50,$3,5)", [w(110), nn(5000 + i), req])));
  assert.equal(R.filter((r) => r.ok).length, 5);
  assert.ok(R.filter((r) => !r.ok).every((r) => r.code === "54000"), JSON.stringify(R.filter((r) => !r.ok).map((r) => r.code)));
  // nguoi goi khac (nan nhan) van duoc cap ngay luc do
  assert.equal((await asRole("service_role", {}, "select * from public.issue_wallet_nonce($1,$2,300,50,$3,5)", [w(110), nn(5100), "cd".repeat(16)])).ok, true);
});

T("Replay: 25 request dong thoi tieu thu CUNG MOT nonce -> dung mot request thanh cong", async () => {
  await asRole("service_role", {}, "select * from public.issue_wallet_nonce($1,$2,300,10)", [w(120), nn(6000)]);
  const R = await Promise.all(Array.from({ length: 25 }, () => asRole("service_role", {}, "select * from public.consume_wallet_nonce($1,$2)", [w(120), nn(6000)])));
  assert.equal(R.filter((r) => r.ok && r.rows.length === 1).length, 1);
  assert.equal(R.filter((r) => r.ok && r.rows.length === 0).length, 24);
  // dung lan nua sau do van that bai
  assert.equal((await asRole("service_role", {}, "select * from public.consume_wallet_nonce($1,$2)", [w(120), nn(6000)])).rows.length, 0);
});

T("Khong deadlock: 80 request tron lan nhieu vi / nguoi goi / thu tu", async () => {
  const jobs = [];
  for (let i = 0; i < 80; i++) {
    const wallet = w(130 + (i % 6)), req = (i % 4).toString(16).repeat(32);
    jobs.push(asRole("service_role", {}, "select * from public.issue_wallet_nonce($1,$2,300,5,$3,50)", [wallet, nn(7000 + i), req]));
  }
  const R = await Promise.all(jobs);
  assert.ok(R.every((r) => r.ok || r.code === "54000"), JSON.stringify(R.filter((r) => !r.ok && r.code !== "54000").map((r) => r.code + r.msg)));
  assert.ok(!R.some((r) => r.code === "40P01"), "deadlock");
});

const memberOf = async (wallet) => admin.query("insert into public.organization_members (organization_id,wallet_address,role) values ($1,$2,'Proposer') on conflict do nothing", [orgId, wallet]);
const countDrafts = async (wallet) => Number((await admin.query("select count(*)::int n from public.metadata_history where created_by=$1 and not onchain_seen", [wallet])).rows[0].n);
const insertDraft = (wallet, n, i) => asRole("authenticated", authClaims(wallet, n), "insert into public.metadata_history (organization_id, metadata_type, metadata_hash, content, created_by) values ($1,'election',$2,'{\"a\":2}',$3)", [orgId, H(900000000 + n * 1000 + i), wallet]);

T("200 ban nhap: 20 INSERT dong thoi tu cung mot vi (da co 195) -> dung 200; ban bo khoa thi vuot", async () => {
  await variant("public.limit_metadata_drafts()", "limit_drafts_locked_slow", (d) => d.replace("if n >= 200 then", "perform pg_sleep(0.15);\n    if n >= 200 then"));
  await variant("public.limit_metadata_drafts()", "limit_drafts_unlocked_slow", (d) => noLock(d).replace("if n >= 200 then", "perform pg_sleep(0.15);\n    if n >= 200 then"));
  const useTrigger = async (fn) => { await admin.query("drop trigger metadata_history_limit on public.metadata_history"); await admin.query(`create trigger metadata_history_limit before insert on public.metadata_history for each row execute function public.${fn}()`); };
  const run20 = (wallet, n) => Promise.all(Array.from({ length: 20 }, (_, i) => insertDraft(wallet, n, i)));

  const W1 = w(201), W2 = w(202), W3 = w(203);
  for (const x of [W1, W2, W3]) { await memberOf(x); await admin.query(`insert into public.metadata_history (organization_id, metadata_type, metadata_hash, content, created_by)
      select $1,'election','0x'||lpad(to_hex(g + $3::int),64,'0'),'{"a":1}',$2 from generate_series(1,195) g`, [orgId, x, Number(BigInt(x) % 1000n) * 1000]); assert.equal(await countDrafts(x), 195); }

  const a = await run20(W1, 201);                                                   // (a) ham that
  assert.equal(a.filter((r) => r.ok).length, 5, JSON.stringify(a.filter((r) => !r.ok).map((r) => r.msg).slice(0, 2)));
  assert.ok(a.filter((r) => !r.ok).every((r) => r.code === "54000"));
  assert.equal(await countDrafts(W1), 200);

  await useTrigger("limit_drafts_locked_slow");                                     // (b) co khoa + cua so race keo dai
  const b = await run20(W2, 202);
  assert.equal(b.filter((r) => r.ok).length, 5);
  assert.equal(await countDrafts(W2), 200);

  await useTrigger("limit_drafts_unlocked_slow");                                   // (c) khong khoa
  const c = await run20(W3, 203);
  assert.ok(c.filter((r) => r.ok).length > 5 && await countDrafts(W3) > 200, "ban khong khoa phai vuot 200");
  await useTrigger("limit_metadata_drafts");                                        // khoi phuc trigger that
});

T("service_role / chain-sync KHONG bi chan boi khoa ban nhap cua client; client cung vi thi xep hang doi", async () => {
  const W = w(301); await memberOf(W);
  await admin.query(`insert into public.elections_chain (election_id_onchain, organization_id, proposer_wallet, created_at_chain, reg_end, commit_end, reveal_end, request_status, candidate_count, metadata_hash, metadata_version)
                     values (0,$1,$2,now(),now(),now(),now(),'Approved',2,$3,1) on conflict do nothing`, [orgId, W, H(1)]);
  const holder = await connect();
  try {
    await holder.query("begin"); await holder.query("set local role authenticated");
    await holder.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(authClaims(W, 301))]);
    await holder.query("insert into public.metadata_history (organization_id, metadata_type, metadata_hash, content, created_by) values ($1,'election',$2,'{}',$3)", [orgId, H(31001), W]);   // giu khoa cua vi W

    // chain-sync (service_role): chen hang su kien + ban nhap cho CHINH vi W phai xong ngay, khong cho khoa
    const t0 = Date.now();
    const svc = await asRole("service_role", {}, `insert into public.metadata_history (organization_id, election_id_onchain, metadata_type, metadata_hash, metadata_version, content, transaction_hash, onchain_seen, created_by)
       values ($1,0,'election',$2,7,'{}',$3,true,$4), ($1,0,'election',$5,8,'{}',$6,true,$4)`, [orgId, H(31002), H(31003), W, H(31004), H(31005)]);
    assert.ok(svc.ok, svc.msg);
    assert.ok(Date.now() - t0 < 2000, "service_role bi chan " + (Date.now() - t0) + "ms");

    // client khac CUNG vi: phai cho den khi giao dich giu khoa ket thuc
    let done = false;
    const waiter = insertDraft(W, 301, 55).then((r) => { done = true; return r; });
    await sleep(500);
    assert.equal(done, false, "INSERT cung vi phai xep hang doi sau khoa");
    // client VI KHAC khong bi chan
    const W2 = w(302); await memberOf(W2);
    const other = await insertDraft(W2, 302, 1);
    assert.ok(other.ok, other.msg);
    await holder.query("commit");
    assert.ok((await waiter).ok);
  } finally { try { await holder.query("rollback"); } catch {} await holder.end(); }
});
