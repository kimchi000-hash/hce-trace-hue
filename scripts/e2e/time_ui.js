// Kiem thu o THOI GIAN (ngay gio <-> phut) o form tao cuoc bau (Hardhat cuc bo + Playwright, Supabase gia lap). Cach chay giong phase5_ui.js.
const fs = require("fs");
const ROOT = require("path").resolve(__dirname, "..", "..");
const S = process.env.SHOTDIR || require("os").tmpdir();
const { ethers } = require(ROOT + "/node_modules/ethers");
const { chromium } = require("playwright");
const reg = require(ROOT + "/artifacts/contracts/project/OrganizationRegistry.sol/OrganizationRegistry.json");
const coreArt = require(ROOT + "/artifacts/contracts/project/ProjectCore.sol/ProjectCore.json");
const meta = require(ROOT + "/scripts/metadata.js");
const RPC = "http://127.0.0.1:8545";
const SB = "https://vfzuniykinaivchhuiul.supabase.co";
const KEY = "sb_publishable_EDmldUtxLGO4J5EvAE0DHQ__RVMvuYu";
const ETHERS_UMD = fs.readFileSync(ROOT + "/node_modules/ethers/dist/ethers.umd.min.js", "utf8");
const log = [];
const check = (n, ok, x) => log.push((ok ? "PASS " : "FAIL ") + n + (x ? " :: " + x : ""));
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

// ---------- Supabase GIA LAP (chi de kiem thu giao dien; KHONG phai Supabase that) ----------
const mock = { nonces: new Map(), drafts: [], files: new Map(), events: [], orgRows: {}, calls: [], authSeen: [], tamper: false, patches: [] };
function jwtFor(wallet) {
  return b64u({ alg: "HS256", typ: "JWT" }) + "." + b64u({ sub: "uid-" + wallet, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, app_metadata: { wallet } }) + ".sig";
}
async function sbHandler(route) {
  const req = route.request(), url = new URL(req.url()), p = url.pathname;
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
  const json = (status, body) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  const h = req.headers();
  mock.calls.push(req.method() + " " + p + url.search.slice(0, 80));
  if (h["apikey"] !== KEY) return json(401, { message: "no apikey" });
  if (/^Bearer sb_publishable/.test(h["authorization"] || "")) return json(401, { message: "khong gui khoa publishable lam Bearer" });
  if (p === "/functions/v1/wallet-auth") {
    const b = JSON.parse(req.postData());
    if (b.action === "nonce") {
      const nonce = ethers.hexlify(ethers.randomBytes(16)).slice(2);
      const message = ["localhost:8080 yeu cau ban dang nhap VoteChain bang vi:", ethers.getAddress(b.wallet), "", "Domain: localhost:8080", "Chain ID: 31337", "Nonce: " + nonce].join("\n");
      mock.nonces.set(nonce, { wallet: b.wallet, message, used: false });
      return json(200, { nonce, message });
    }
    const n = mock.nonces.get(b.nonce);
    if (!n || n.used || n.wallet !== b.wallet || ethers.verifyMessage(n.message, b.signature).toLowerCase() !== b.wallet) return json(401, { error: "Nonce khong hop le hoac da het han" });
    n.used = true;
    return json(200, { token_hash: "th-" + b.wallet, type: "magiclink" });
  }
  if (p === "/auth/v1/verify") {
    const b = JSON.parse(req.postData());
    const w = String(b.token_hash).replace("th-", "");
    return json(200, { access_token: jwtFor(w), refresh_token: "r", expires_in: 3600 });
  }
  const jw = (() => { const a = (h["authorization"] || "").replace("Bearer ", ""); try { return JSON.parse(Buffer.from(a.split(".")[1], "base64url")).app_metadata.wallet; } catch (_) { return null; } })();
  if (req.method() !== "GET") mock.authSeen.push(jw);
  if (p.startsWith("/storage/v1/object/") && req.method() === "POST") {
    if (!jw) return json(401, { message: "can dang nhap" });
    const key = p.replace("/storage/v1/object/", "");
    if (mock.files.has(key)) return json(409, { message: "The resource already exists" });
    mock.files.set(key, { bytes: req.postDataBuffer(), mime: h["content-type"] });
    return json(200, { Key: key });
  }
  if (p === "/rest/v1/organizations" && req.method() === "GET") {
    const id = url.searchParams.get("organization_id_onchain").replace("eq.", "");
    const row = mock.orgRows[id];
    return json(200, row ? [row] : []);
  }
  if (p === "/rest/v1/organizations" && req.method() === "PATCH") {
    if (!jw) return json(200, []);
    mock.patches.push(JSON.parse(req.postData()));
    return json(200, [{ id: "ok" }]);
  }
  if (p === "/rest/v1/metadata_history" && req.method() === "POST") {
    if (!jw) return json(401, { message: "can dang nhap" });
    const row = JSON.parse(req.postData());
    if (row.created_by !== jw) return json(403, { message: "new row violates row-level security policy" });
    if (mock.drafts.some((d) => d.metadata_hash === row.metadata_hash && d.metadata_type === row.metadata_type && d.candidate_id_onchain === row.candidate_id_onchain)) return json(409, { code: "23505", message: "duplicate" });
    mock.drafts.push(row);
    return route.fulfill({ status: 201, headers: cors, body: "" });
  }
  if (p === "/rest/v1/metadata_history" && req.method() === "GET") {
    const q = url.searchParams;
    const eid = q.get("election_id_onchain");
    let rows = [];
    if (eid && eid.startsWith("eq.")) rows = mock.events.filter((r) => String(r.election_id_onchain) === eid.slice(3));
    else if (eid === "is.null") rows = mock.drafts.slice();
    if (mock.tamper) rows = rows.map((r) => ({ ...r, content: r.content && { ...r.content, title: (r.content.title || "") + "!" , fullName: r.content.fullName && r.content.fullName + "!" } }));
    return json(200, rows);
  }
  return json(404, { message: "mock: chua ho tro " + req.method() + " " + p });
}

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const accts = (await provider.send("eth_accounts", [])).map(ethers.getAddress);
  const admin = await provider.getSigner(19);
  const fr = new ethers.ContractFactory(reg.abi, reg.bytecode, admin); const registry = await fr.deploy(); await registry.waitForDeployment();
  const fc = new ethers.ContractFactory(coreArt.abi, coreArt.bytecode, admin); const core = await fc.deploy(await registry.getAddress()); await core.waitForDeployment();
  const addr = await core.getAddress();
  check("deploy: registry.platformAdmin = vi 19", (await registry.platformAdmin()) === accts[19]);

  const browser = await chromium.launch();
  async function open(idx, opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/ethers.umd.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: ETHERS_UMD }));
    await ctx.route(SB + "/**", sbHandler);
    // RPC doc cong khai cua trang (Sepolia) duoc chuyen sang Hardhat cuc bo de kiem thu duong doc khong can vi
    await ctx.route("https://ethereum-sepolia-rpc.publicnode.com/**", async (route) => {
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: route.request().postData() });
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: await r.text() });
    });
    await ctx.addInitScript(({ me, rpc }) => {
      const call = async (method, params) => {
        const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }) });
        const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; } return j.result;
      };
      window.ethereum = { request: async ({ method, params }) => (method === "eth_requestAccounts" || method === "eth_accounts") ? [me] : call(method, params), on() {} };
    }, { me: accts[idx], rpc: RPC });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => log.push("PAGEERROR " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) log.push("CONSOLE.ERR " + m.text().slice(0, 200)); });
    await page.goto(`http://127.0.0.1:8099/index.html?contract=${addr}&chain=31337&election=0#/${opts.route || "org"}`);
    await page.waitForFunction(() => window.__votechain && window.__votechain.S.account, null, { timeout: 20000 });
    return page;
  }
  const idle = (p) => p.waitForFunction(() => window.__votechain.S.busy === false, null, { timeout: 40000 });
  const click = async (p, sel) => { await p.click(sel); await p.waitForTimeout(200); await idle(p); };
  const toasts = (p) => p.textContent("#toasts");
  const shot = (p, n) => p.screenshot({ path: S + "/p5_" + n + ".png" });

  const p = await open(1, { route: "create" });
  await p.waitForSelector("#cRegAt");
  const v = (id) => p.inputValue("#" + id);
  const loc = (ms) => { const d = new Date(ms), z = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + "T" + z(d.getHours()) + ":" + z(d.getMinutes()); };
  const ms = (x) => new Date(x).getTime();

  // 1) mac dinh 5/10/10 phut -> 3 o ngay gio lech dung 5, 15, 25 phut (cho phep sai so 1 phut do lam tron)
  const t0 = Date.now();
  const d1 = [await v("cRegAt"), await v("cCommitAt"), await v("cRevealAt")].map(ms);
  check("mac dinh: moc duyet ~ +5 phut", Math.abs((d1[0] - t0) / 60000 - 5) <= 1.5);
  check("mac dinh: moc nop phieu cach moc duyet 10 phut", Math.round((d1[1] - d1[0]) / 60000) === 10);
  check("mac dinh: moc mo phieu cach moc nop phieu 10 phut", Math.round((d1[2] - d1[1]) / 60000) === 10);
  check("co dong xem truoc gio", /Duyệt đến .* · Nộp phiếu đến .* · Mở phiếu đến .* · Kết quả công bố sau/.test(await p.textContent("#cTimePlan")), (await p.textContent("#cTimePlan")).slice(0, 80));

  // 2) doi so phut -> ngay gio doi theo
  await p.fill("#cReg", "60"); await p.fill("#cCommit", "120"); await p.fill("#cReveal", "30");
  const d2 = [await v("cRegAt"), await v("cCommitAt"), await v("cRevealAt")].map(ms);
  check("nhap phut 60/120/30 -> ngay gio 60, 180, 210 phut", Math.abs((d2[0] - Date.now()) / 60000 - 60) <= 1.5 && Math.round((d2[1] - d2[0]) / 60000) === 120 && Math.round((d2[2] - d2[1]) / 60000) === 30);

  // 3) chon ngay gio -> so phut doi theo
  const base = Date.now();
  await p.fill("#cRegAt", loc(base + 24 * 3600000));
  await p.fill("#cCommitAt", loc(base + 3 * 24 * 3600000));
  await p.fill("#cRevealAt", loc(base + 4 * 24 * 3600000));
  const m = [Number(await v("cReg")), Number(await v("cCommit")), Number(await v("cReveal"))];
  check("chon ngay gio: duyet ~ 1 ngay (1440 phut)", Math.abs(m[0] - 1440) <= 2, String(m[0]));
  check("chon ngay gio: nop phieu = 2 ngay (2880 phut)", m[1] === 2880, String(m[1]));
  check("chon ngay gio: mo phieu = 1 ngay (1440 phut)", m[2] === 1440, String(m[2]));
  check("dong xem truoc co chu 'Kết quả công bố sau'", /Kết quả công bố sau/.test(await p.textContent("#cTimePlan")));

  // 4) moc sai (ket thuc truoc bat dau) -> canh bao
  await p.fill("#cCommitAt", loc(base + 1 * 3600000));
  check("moc sai thu tu -> canh bao", /ít nhất 1 phút/.test(await p.textContent("#cTimePlan")), await p.textContent("#cTimePlan"));

  // 5) pha duyet ngan -> khong hien luu y nua
  await p.fill("#cReg", "5");
  check("pha duyet < 10 phut: khong con dong luu y het han (da bo khoi giao dien)", !/dưới 10 phút/.test(await p.textContent("#cTimePlan")));
  await shot(p, "time_ui");

  await browser.close();
  console.log(log.join("\n"));
  const bad = log.filter((l) => /^(FAIL|PAGEERROR|CONSOLE\.ERR)/.test(l)).length;
  console.log("\n" + (log.filter((l) => l.startsWith("PASS")).length) + " dat / " + bad + " loi");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
