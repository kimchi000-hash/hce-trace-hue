// Kiem thu trang PHE DUYET theo dung cuoc dang cho duyet (Hardhat cuc bo + Playwright, Supabase gia lap). Cach chay giong phase5_ui.js.
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

  // ----- dung san: to chuc #1, 2 nguoi duyet (vi 1, 2); cuoc #0 DA KICH HOAT, cuoc #1 va #2 dang CHO DUYET, ten ung vien khac nhau -----
  const sg = (i) => provider.getSigner(i);
  const R = registry.connect(await sg(0)), P = registry.connect(admin);
  await (await R.registerOrganization("CLB", ethers.id("org"))).wait(); await (await P.verifyOrganization(1)).wait();
  for (const i of [1, 2]) { await (await R.addMember(1, accts[i], 1)).wait(); await (await R.addApprover(1, accts[i])).wait(); }
  async function mk(title, names) {
    const em = meta.electionMetadata({ organizationId: 1, title, description: "Mô tả " + title, purpose: "Mục đích" });
    const cms = names.map((n, i) => meta.candidateMetadata({ index: i, fullName: n, bio: "Tiểu sử " + n }));
    await (await core.connect(await sg(0)).createElection({
      organizationId: 1, title, names, candidateWallets: [],
      regMinutes: 30, commitMinutes: 10, revealMinutes: 10, quorumBps: 5000, voterCount: 3, merkleRoot: ethers.id("root"),
      metadataHash: meta.metadataHash(em), candidateMetadataHashes: cms.map(meta.metadataHash),
    })).wait();
  }
  await mk("Cuộc cũ", ["Cũ Một", "Cũ Hai"]);
  for (const i of [1, 2]) await (await core.connect(await sg(i)).approveElection(0)).wait();
  await mk("Cuộc mới", ["Mới Một", "Mới Hai"]);
  await mk("Cuộc thứ ba", ["Ba Một", "Ba Hai"]);

  // mo trang Phe duyet khi cuoc dang chon la #0 (da kich hoat, KHONG nam trong danh sach cho)
  const p = await open(1, { route: "approve" });
  await p.waitForFunction(() => window.__votechain.S.election && String(window.__votechain.S.election.id) === "0", null, { timeout: 20000 });
  await p.waitForFunction(() => /Cuộc #[12] /.test(document.getElementById("approveCands").textContent), null, { timeout: 30000 });
  let txt = await p.textContent("#approveCands");
  check("tu chon cuoc dang cho duyet (khong dung cuoc cu #0)", /Mới Một|Ba Một/.test(txt) && !/Cũ Một/.test(txt), txt.slice(0, 80));
  const first = /Cuộc #(\d)/.exec(txt)[1];

  // bam "Xem hoso" o cuoc con lai -> khoi ung vien doi theo
  const other = first === "1" ? "2" : "1", want = other === "1" ? "Mới Một" : "Ba Một";
  await click(p, "#view-" + other);
  await p.waitForFunction((n) => document.getElementById("approveCands").textContent.includes(n), want, { timeout: 30000 });
  txt = await p.textContent("#approveCands");
  check("bam 'Xem ho so' -> hien ung vien cua cuoc #" + other, txt.includes(want) && txt.includes("Cuộc #" + other), txt.slice(0, 80));
  const mt = await p.textContent("#approveMeta");
  check("khoi xac thuc hash cung doi theo cuoc #" + other, /Ứng viên 1 \((Mới|Ba) Một\)/.test(mt), mt.slice(0, 100));
  check("khong co ung vien cua cuoc cu #0", !/Cũ Một/.test(await p.textContent("#approveCands")) && !/Cũ Một/.test(mt));
  await shot(p, "approve_focus");

  await browser.close();
  console.log(log.join("\n"));
  const bad = log.filter((l) => /^(FAIL|PAGEERROR|CONSOLE\.ERR)/.test(l)).length;
  console.log("\n" + (log.filter((l) => l.startsWith("PASS")).length) + " dat / " + bad + " loi");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
