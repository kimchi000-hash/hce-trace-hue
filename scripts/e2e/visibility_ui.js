// Kiem thu PHAM VI XEM (info / candidates / results) tren giao dien (Hardhat cuc bo + Playwright, Supabase GIA LAP co mo phong phan quyen xem).
// Cach chay giong phase5_ui.js: Hardhat node cong 8545 + `python3 -m http.server 8099 --directory web`.
// Luu y: Supabase o day la gia lap de kiem thu giao dien; RLS that duoc kiem o supabase/tests/rls.test.js.
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
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

// ---------- Supabase GIA LAP ----------
// chain: mo phong dong elections_chain + quyen xem (do chain-sync va RLS that tao ra)
const mock = { nonces: new Map(), drafts: [], events: [], files: new Map(), orgRows: {}, chain: null, signCalls: 0, rpcCalls: [] };
function jwtFor(wallet) {
  return b64u({ alg: "HS256", typ: "JWT" }) + "." + b64u({ sub: "uid-" + wallet, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, app_metadata: { wallet } }) + ".sig";
}
// Mo phong can_view_election: public->true; chua dang nhap->false; nguoi tao/nhom duyet->true; internal->thanh vien; restricted->vai tro duoc chon
function can(wallet, scope) {
  const c = mock.chain;
  if (!c) return true;
  const v = scope === "info" ? c.info_visibility : scope === "candidates" ? c.candidate_visibility : c.results_visibility;
  if (v === "public") return true;
  if (!wallet) return false;
  if (wallet === c.creator || c.approvers.includes(wallet)) return true;
  const role = c.members[wallet];
  if (!role) return false;
  if (v === "internal") return true;
  return c.restricted_roles.includes(role);
}
async function sbHandler(route) {
  const req = route.request(), url = new URL(req.url()), p = url.pathname;
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
  const json = (status, body) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  const h = req.headers();
  // URL ky va URL cong khai KHONG can apikey (the <img> va fetch cua anh khong gui header)
  let m;
  if ((m = /^\/storage\/v1\/object\/sign\/([a-z-]+)\/(.+)$/.exec(p)) && req.method() === "GET") {
    const f = mock.files.get(m[1] + "/" + m[2]);
    return f && url.searchParams.get("token") ? route.fulfill({ status: 200, headers: { ...cors, "content-type": f.mime }, body: f.bytes }) : json(404, { message: "no" });
  }
  if ((m = /^\/storage\/v1\/object\/public\/([a-z-]+)\/(.+)$/.exec(p)) && req.method() === "GET") {
    if (/private/.test(m[1])) return json(400, { message: "Bucket not found" });
    const f = mock.files.get(m[1] + "/" + m[2]);
    return f ? route.fulfill({ status: 200, headers: { ...cors, "content-type": f.mime }, body: f.bytes }) : json(404, { message: "no" });
  }
  if (h["apikey"] !== KEY) return json(401, { message: "no apikey" });
  if (p === "/functions/v1/wallet-auth") {
    const b = JSON.parse(req.postData());
    if (b.action === "nonce") {
      const nonce = ethers.hexlify(ethers.randomBytes(16)).slice(2);
      const message = ["localhost:8080 yeu cau ban dang nhap VoteChain bang vi:", ethers.getAddress(b.wallet), "", "Domain: localhost:8080", "Chain ID: 31337", "Nonce: " + nonce].join("\n");
      mock.nonces.set(nonce, { wallet: b.wallet, message, used: false });
      return json(200, { nonce, message });
    }
    const n = mock.nonces.get(b.nonce);
    if (!n || n.used || n.wallet !== b.wallet || ethers.verifyMessage(n.message, b.signature).toLowerCase() !== b.wallet) return json(401, { error: "Nonce khong hop le" });
    n.used = true;
    return json(200, { token_hash: "th-" + b.wallet, type: "magiclink" });
  }
  if (p === "/auth/v1/verify") {
    const b = JSON.parse(req.postData());
    return json(200, { access_token: jwtFor(String(b.token_hash).replace("th-", "")), refresh_token: "r", expires_in: 3600 });
  }
  const jw = (() => { const a = (h["authorization"] || "").replace("Bearer ", ""); try { return JSON.parse(Buffer.from(a.split(".")[1], "base64url")).app_metadata.wallet; } catch (_) { return null; } })();
  // --- kho anh ---
  if ((m = /^\/storage\/v1\/object\/sign\/([a-z-]+)\/(.+)$/.exec(p)) && req.method() === "POST") {
    mock.signCalls++;
    const [, bucket, path] = m;
    const scope = bucket === "election-private" ? "info" : "candidates";
    if (!jw || !can(jw, scope) || !mock.files.has(bucket + "/" + path)) return json(400, { message: "Object not found" });
    return json(200, { signedURL: "/object/sign/" + bucket + "/" + path + "?token=t" });
  }
  if (p.startsWith("/storage/v1/object/") && req.method() === "POST") {
    if (!jw) return json(401, { message: "can dang nhap" });
    const key = p.replace("/storage/v1/object/", "");
    if (mock.files.has(key)) return json(409, { message: "The resource already exists" });
    mock.files.set(key, { bytes: req.postDataBuffer(), mime: h["content-type"] });
    return json(200, { Key: key });
  }
  // --- bang du lieu ---
  if (p === "/rest/v1/organizations" && req.method() === "GET") {
    const id = (url.searchParams.get("organization_id_onchain") || "").replace("eq.", "");
    return json(200, mock.orgRows[id] ? [mock.orgRows[id]] : []);
  }
  if (p === "/rest/v1/elections_chain" && req.method() === "GET") {
    const sel = url.searchParams.get("select") || "";
    if (!/info_visibility/.test(sel)) return json(200, []);
    const c = mock.chain;
    return json(200, c ? [{ election_id_onchain: 0, info_visibility: c.info_visibility, candidate_visibility: c.candidate_visibility, results_visibility: c.results_visibility, restricted_roles: c.restricted_roles }] : []);
  }
  if (p === "/rest/v1/rpc/can_view_election" && req.method() === "POST") {
    const b = JSON.parse(req.postData());
    mock.rpcCalls.push(b.p_scope + ":" + (jw || "anon").slice(0, 6));
    return json(200, can(jw, b.p_scope));
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
    const eid = url.searchParams.get("election_id_onchain");
    let rows = [];
    if (eid && eid.startsWith("eq.")) rows = mock.events.filter((r) => String(r.election_id_onchain) === eid.slice(3) && can(jw, r.metadata_type === "election" ? "info" : "candidates"));
    else if (eid === "is.null") rows = mock.drafts.filter((d) => d.created_by === jw);   // ban nhap chi nguoi tao thay
    return json(200, rows);
  }
  return json(404, { message: "mock: chua ho tro " + req.method() + " " + p });
}

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const accts = (await provider.send("eth_accounts", [])).map(ethers.getAddress);
  const lcs = accts.map((a) => a.toLowerCase());
  const admin = await provider.getSigner(19);
  const fr = new ethers.ContractFactory(reg.abi, reg.bytecode, admin); const registry = await fr.deploy(); await registry.waitForDeployment();
  const fc = new ethers.ContractFactory(coreArt.abi, coreArt.bytecode, admin); const core = await fc.deploy(await registry.getAddress()); await core.waitForDeployment();
  const addr = await core.getAddress();
  const sg = (i) => provider.getSigner(i);

  const browser = await chromium.launch();
  async function open(idx, opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/ethers.umd.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: ETHERS_UMD }));
    await ctx.route(SB + "/**", sbHandler);
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
  const login = async (p) => { await click(p, "#btnSbLogin"); await p.waitForFunction(() => /Đã đăng nhập/.test(document.querySelector("#btnSbLogin").textContent), null, { timeout: 15000 }); await p.waitForTimeout(600); await idle(p); };
  const shot = (p, n) => p.screenshot({ path: S + "/vis_" + n + ".png" });

  // ----- dung san: to chuc #1; vi 0 = chu so huu (Manager); vi 1 = Proposer (nguoi tao); vi 2,3 = nguoi duyet; vi 4 = Member; vi 5 = Proposer khac; vi 6 = nguoi la -----
  const R = registry.connect(await sg(0)), P = registry.connect(admin);
  await (await R.registerOrganization("CLB", ethers.id("org"))).wait(); await (await P.verifyOrganization(1)).wait();
  await (await R.addMember(1, accts[1], 2)).wait();
  for (const i of [2, 3]) { await (await R.addMember(1, accts[i], 1)).wait(); await (await R.addApprover(1, accts[i])).wait(); }
  await (await R.addMember(1, accts[4], 1)).wait();
  await (await R.addMember(1, accts[5], 2)).wait();
  mock.orgRows["1"] = { id: "11111111-1111-1111-1111-111111111111", name: "CLB", description: null, logo_url: null, organization_type: "club", verification_status: "Verified", synced_at: new Date().toISOString() };

  // ===== 1. Tao cuoc bau cu: thong tin = noi bo, ung vien = han che (them Manager), ket qua = han che =====
  const p1 = await open(1, { route: "create" });
  await p1.waitForFunction(() => document.querySelectorAll("#cOrg option").length > 1, null, { timeout: 15000 });
  await p1.selectOption("#cOrg", "1");
  await p1.waitForFunction(() => window.__votechain.S.createCtx && window.__votechain.S.createCtx.orgId === 1, null, { timeout: 10000 });
  check("form tao co the 'Pham vi xem' voi 3 lua chon, mac dinh cong khai", (await p1.locator("#cVisInfo option").count()) === 3 && (await p1.inputValue("#cVisInfo")) === "public" && (await p1.inputValue("#cVisCands")) === "public" && (await p1.inputValue("#cVisRes")) === "public" && await p1.locator("#cVisRoles").evaluate((n) => n.classList.contains("hidden")));
  await p1.fill("#cTitle", "Bầu riêng tư");
  await p1.fill("#cDesc", "Mô tả riêng tư của CLB");
  await p1.fill("#cNames", "Nguyễn Văn A\nTrần Thị B");
  await p1.waitForSelector("#cCandBox details", { timeout: 5000 });
  await p1.evaluate(() => document.querySelectorAll("#cCandBox details").forEach((d) => (d.open = true)));
  await p1.locator("#cCandBox details").nth(0).locator("textarea").nth(0).fill("Tiểu sử kín của A");
  await p1.setInputFiles("#cCover", { name: "bia.png", mimeType: "image/png", buffer: PNG });
  await p1.locator("#cCandBox details").nth(0).locator("input[type=file]").first().setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
  await p1.fill("#cVoters", accts.slice(0, 6).join("\n"));
  await p1.fill("#cReg", "30");
  await p1.selectOption("#cVisInfo", "internal");
  await p1.selectOption("#cVisCands", "restricted");
  await p1.selectOption("#cVisRes", "restricted");
  check("chon 'Han che' thi hien o tich vai tro Manager/Proposer", !(await p1.locator("#cVisRoles").evaluate((n) => n.classList.contains("hidden"))));
  await p1.check("#cVisMgr");
  await click(p1, "#btnBuild");
  await p1.waitForTimeout(300);
  const checks = await p1.textContent("#cChecks");
  check("danh sach kiem tra neu ro pham vi xem da chon", /Phạm vi xem: thông tin nội bộ tổ chức, hồ sơ ứng viên hạn chế, kết quả hạn chế \(thêm Manager\)/.test(checks), checks.replace(/\s+/g, " ").slice(0, 300));
  const prevHash = await p1.evaluate(() => window.__votechain.S.lastBuilt.meta.electionHash);
  const prev2 = await p1.evaluate(async () => { await new Promise((r) => setTimeout(r, 50)); return null; });
  await click(p1, "#btnBuild");
  check("xem truoc lai: hash khong doi (salt on dinh trong cung mot lan soan)", (await p1.evaluate(() => window.__votechain.S.lastBuilt.meta.electionHash)) === prevHash);
  await shot(p1, "01_create_form");
  await click(p1, "#btnCreate");
  await p1.waitForSelector("#cResult .alert.ok", { timeout: 25000 });
  check("tao cuoc bau cu thanh cong", (await p1.textContent("#cResult")).includes("#0"));
  const coverKey = [...mock.files.keys()].find((k) => k.startsWith("election-"));
  const avKey = [...mock.files.keys()].find((k) => k.startsWith("candidate-"));
  const checksum = ethers.keccak256(PNG);
  check("anh bia o kho RIENG TU (election-private), ten = keccak256 noi dung", coverKey === "election-private/1/cover/" + checksum + ".png", coverKey);
  check("anh ung vien o kho RIENG TU (candidate-private)", avKey === "candidate-private/1/avatar/" + checksum + ".png", avKey);
  const dE = mock.drafts.find((d) => d.metadata_type === "election");
  const dC0 = mock.drafts.find((d) => d.metadata_type === "candidate" && d.candidate_id_onchain === 0);
  const dC1 = mock.drafts.find((d) => d.metadata_type === "candidate" && d.candidate_id_onchain === 1);
  check("noi dung cuoc bau cu mang visibility dung 3 pham vi + vai tro Manager", JSON.stringify(dE.content.visibility) === JSON.stringify({ info: "internal", candidates: "restricted", results: "restricted", roles: ["Manager"] }));
  check("co salt ngau nhien (32 hex) cho cuoc va tung ung vien khong cong khai", /^0x[0-9a-f]{32}$/.test(dE.content.salt) && /^0x[0-9a-f]{32}$/.test(dC0.content.salt) && /^0x[0-9a-f]{32}$/.test(dC1.content.salt) && dC0.content.salt !== dC1.content.salt);
  check("URL anh trong noi dung tro toi .../object/authenticated/<kho rieng>/", dE.content.cover.url === SB + "/storage/v1/object/authenticated/election-private/1/cover/" + checksum + ".png" && dC0.content.avatar.url === SB + "/storage/v1/object/authenticated/candidate-private/1/avatar/" + checksum + ".png");
  check("hash tren chuoi = hash doc lap cua noi dung (ca cuoc va ung vien)", (await core.getElectionOrg(0)).metadataHash === meta.metadataHash(dE.content) && (await core.getCandidateMetadata(0, 0)).metadataHash === meta.metadataHash(dC0.content));

  // Mo phong chain-sync: chi ghi noi dung KHOP hash + phan chieu pham vi xem vao elections_chain
  async function syncMock() {
    const eh = (await core.getElectionOrg(0)).metadataHash;
    const rows = [];
    const e = mock.drafts.filter((d) => d.metadata_type === "election" && d.metadata_hash === eh).pop();
    if (e) rows.push({ election_id_onchain: 0, metadata_type: "election", candidate_id_onchain: null, metadata_hash: eh, content: e.content });
    for (let i = 0; i < 2; i++) {
      const h = (await core.getCandidateMetadata(0, i)).metadataHash;
      const c = mock.drafts.filter((d) => d.metadata_type === "candidate" && d.candidate_id_onchain === i && d.metadata_hash === h).pop();
      if (c) rows.push({ election_id_onchain: 0, metadata_type: "candidate", candidate_id_onchain: i, metadata_hash: h, content: c.content });
    }
    mock.events = rows;
    const v = e && e.content.visibility ? e.content.visibility : { info: "public", candidates: "public", results: "public", roles: [] };
    mock.chain = { info_visibility: v.info, candidate_visibility: v.candidates, results_visibility: v.results, restricted_roles: v.roles, creator: lcs[1], approvers: [lcs[2], lcs[3]], members: { [lcs[0]]: "Manager", [lcs[1]]: "Proposer", [lcs[2]]: "Member", [lcs[3]]: "Member", [lcs[4]]: "Member", [lcs[5]]: "Proposer" } };
  }
  await syncMock();

  // ===== 2. Nguoi la (chua dang nhap): thay khoa, khong co noi dung =====
  const pOut = await open(6, { route: "election" });
  await pOut.waitForFunction(() => window.__votechain.S.election && /không công khai/.test(document.querySelector("#elDescription").textContent), null, { timeout: 25000 });
  const outDesc = await pOut.textContent("#elDescription");
  check("nguoi la: mo ta KHONG hien, co thong bao pham vi xem", !/Mô tả riêng tư/.test(outDesc) && /Nội bộ tổ chức/.test(outDesc), outDesc.slice(0, 160));
  await pOut.waitForFunction(() => /không công khai với ví hiện tại/.test(document.querySelector("#eeMeta").textContent), null, { timeout: 15000 });
  const outMeta = await pOut.textContent("#eeMeta");
  check("khoi xac thuc hash: trang thai 'khong cong khai', KHONG bao 'KHONG khop hash'", !/KHÔNG khớp/.test(outMeta) && /Phạm vi xem: thông tin nội bộ tổ chức · hồ sơ ứng viên hạn chế · kết quả hạn chế \(vai trò thêm: Manager\)/.test(outMeta), outMeta.replace(/\s+/g, " ").slice(0, 300));
  const outGrid = await pOut.textContent("#candGrid");
  check("nguoi la: the ung vien hien 'Ho so ung vien khong cong khai', khong lo tieu su", /Hồ sơ ứng viên không công khai/.test(outGrid) && !/Tiểu sử kín/.test(outGrid), outGrid.replace(/\s+/g, " ").slice(0, 200));
  check("nguoi la: khong goi duoc anh rieng tu (khong yeu cau chu ky URL khi chua dang nhap)", mock.signCalls === 0);
  check("nguoi la: ung dung biet ket qua bi khoa", await pOut.evaluate(() => window.__votechain.S.election.resultsLocked === true));
  await shot(pOut, "02_outsider");

  // ===== 3. Thanh vien (vi 4): xem duoc thong tin (noi bo), KHONG xem duoc ho so (han che chi Manager) =====
  const pMem = await open(4, { route: "election" });
  await pMem.waitForFunction(() => window.__votechain.S.election, null, { timeout: 20000 });
  await login(pMem);
  await pMem.waitForFunction(() => /Mô tả riêng tư/.test(document.querySelector("#elDescription").textContent), null, { timeout: 20000 });
  check("thanh vien: sau khi dang nhap thay mo ta (pham vi noi bo)", true);
  await pMem.waitForFunction(() => /Hồ sơ ứng viên không công khai/.test(document.querySelector("#candGrid").textContent), null, { timeout: 15000 });
  check("thanh vien: ho so ung vien van khoa (han che, chi Manager duoc them)", !/Tiểu sử kín/.test(await pMem.textContent("#candGrid")));
  const memCover = await pMem.locator("#detCover img").count() ? await pMem.getAttribute("#detCover img", "src") : "";
  check("thanh vien: anh bia (kho rieng, pham vi noi bo) hien qua URL ky co thoi han", /\/storage\/v1\/object\/sign\/election-private\/1\/cover\/.*\?token=/.test(memCover), memCover);

  // ===== 4. Manager (vi 0): xem duoc ho so ung vien (vai tro duoc them), Proposer (vi 5) thi khong =====
  const pMgr = await open(0, { route: "election" });
  await pMgr.waitForFunction(() => window.__votechain.S.election, null, { timeout: 20000 });
  await login(pMgr);
  await pMgr.waitForFunction(() => /Tiểu sử kín của A/.test(document.querySelector("#candGrid").textContent), null, { timeout: 20000 });
  check("Manager: thay tieu su ung vien (vai tro duoc chon them)", true);
  const mgrAv = await pMgr.locator("#candGrid .avatar img").count() ? await pMgr.getAttribute("#candGrid .avatar img", "src") : "";
  check("Manager: avatar ung vien (kho rieng) hien qua URL ky", /\/storage\/v1\/object\/sign\/candidate-private\/1\/avatar\/.*\?token=/.test(mgrAv), mgrAv);
  const pPro = await open(5, { route: "election" });
  await pPro.waitForFunction(() => window.__votechain.S.election, null, { timeout: 20000 });
  await login(pPro);
  await pPro.waitForFunction(() => /Mô tả riêng tư/.test(document.querySelector("#elDescription").textContent), null, { timeout: 20000 });
  check("Proposer (khong duoc chon): thay mo ta (noi bo) nhung KHONG thay ho so ung vien", !/Tiểu sử kín/.test(await pPro.textContent("#candGrid")) && /Hồ sơ ứng viên không công khai/.test(await pPro.textContent("#candGrid")));

  // ===== 5. Nguoi tao (vi 1): thay het; form sua da dien pham vi hien tai; doi 'thong tin' sang cong khai -> anh bia chuyen kho =====
  const pCre = await open(1, { route: "election" });
  await pCre.waitForFunction(() => window.__votechain.S.election, null, { timeout: 20000 });
  await login(pCre);
  await pCre.waitForFunction(() => /Mô tả riêng tư/.test(document.querySelector("#elDescription").textContent), null, { timeout: 20000 });
  await pCre.waitForFunction(() => !document.querySelector("#metaOrg").classList.contains("hidden") && document.querySelector("#moDesc").value === "Mô tả riêng tư của CLB", null, { timeout: 20000 });
  check("nguoi tao: form sua dien san noi dung va pham vi hien tai", (await pCre.inputValue("#moVisInfo")) === "internal" && (await pCre.inputValue("#moVisCands")) === "restricted" && (await pCre.inputValue("#moVisRes")) === "restricted" && await pCre.isChecked("#moVisMgr") && !(await pCre.isChecked("#moVisPro")));
  check("nguoi tao thay ca ho so ung vien (luon xem duoc)", /Tiểu sử kín của A/.test(await pCre.textContent("#candGrid")));
  await pCre.evaluate(() => { document.querySelector("#metaOrg details").open = true; });
  await pCre.selectOption("#moVisInfo", "public");
  await pCre.check("#moAck");
  await click(pCre, "#btnMoSave");
  await pCre.waitForFunction(() => /Đã ghi \d+ hash/.test(document.querySelector("#moStatus").textContent), null, { timeout: 40000 });
  const stat = await pCre.textContent("#moStatus");
  check("chi cuoc bau cu doi hash (ung vien giu nguyen vi pham vi ung vien khong doi)", /Đã ghi 1 hash/.test(stat), stat);
  const dE2 = mock.drafts.filter((d) => d.metadata_type === "election").pop();
  check("noi dung moi: thong tin cong khai, KHONG con salt, ket qua/ung vien giu han che", dE2.content.visibility.info === "public" && dE2.content.visibility.candidates === "restricted" && dE2.content.visibility.results === "restricted" && dE2.content.visibility.roles.join() === "Manager" && !("salt" in dE2.content));
  const pubKey = "election-assets/1/cover/" + checksum + ".png";
  check("anh bia duoc chep sang kho CONG KHAI, byte nguyen ven (cung checksum)", mock.files.has(pubKey) && ethers.keccak256(mock.files.get(pubKey).bytes) === checksum);
  check("URL anh bia moi la URL cong khai", dE2.content.cover.url === SB + "/storage/v1/object/public/" + pubKey, dE2.content.cover.url);
  check("hash tren chuoi = hash doc lap cua noi dung moi", (await core.getElectionOrg(0)).metadataHash === meta.metadataHash(dE2.content));
  await syncMock();
  const dC0b = mock.drafts.filter((d) => d.metadata_type === "candidate" && d.candidate_id_onchain === 0).pop();
  check("ho so ung vien 0 giu nguyen (cung salt, avatar van o kho rieng)", dC0b.content.salt === dC0.content.salt && dC0b.content.avatar.url.includes("candidate-private"));

  // nguoi la, tai lai: nay thay mo ta (da cong khai) nhung van khong thay ho so ung vien
  await pOut.reload();
  await pOut.waitForFunction(() => /Mô tả riêng tư/.test((document.querySelector("#elDescription") || {}).textContent || ""), null, { timeout: 25000 });
  await pOut.waitForFunction(() => /Hồ sơ ứng viên không công khai/.test(document.querySelector("#candGrid").textContent), null, { timeout: 15000 });
  check("sau khi doi: nguoi la thay mo ta cong khai, van khong thay ho so ung vien", true);

  // ===== 6. Ket thuc cuoc: ket qua han che chi hien voi nguoi co quyen =====
  await (await core.connect(await sg(2)).approveElection(0)).wait();
  await (await core.connect(await sg(3)).approveElection(0)).wait();
  await provider.send("evm_increaseTime", [61 * 60]); await provider.send("evm_mine", []);
  await pOut.evaluate(() => { location.hash = "#/result"; });
  await click(pOut, "#btnResult");
  await pOut.waitForFunction(() => /Kết quả của cuộc này không công khai/.test(document.querySelector("#resultBox").textContent), null, { timeout: 20000 });
  const rb = await pOut.textContent("#resultBox");
  check("nguoi la: trang Ket qua chi hien thong bao khoa, kem luu y du lieu tren chuoi van cong khai", /vẫn nằm trên chuỗi công khai/.test(rb) && !/người thắng cử|Kết quả hợp lệ|Kết quả không hợp lệ/.test(rb), rb.replace(/\s+/g, " ").slice(0, 260));
  await shot(pOut, "03_result_locked");
  await pMgr.evaluate(() => { location.hash = "#/result"; });
  await click(pMgr, "#btnResult");
  await pMgr.waitForFunction(() => /Kết quả (hợp lệ|không hợp lệ)/.test(document.querySelector("#resultBox").textContent), null, { timeout: 20000 });
  check("Manager: trang Ket qua hien day du", true);
  const dash = await open(6, { route: "dashboard" });
  await dash.waitForFunction(() => window.__votechain.S.all && window.__votechain.S.all.length, null, { timeout: 20000 });
  await dash.waitForTimeout(800);
  check("Dashboard (nguoi la): lich su hien 'Ket qua han che' thay vi nguoi thang", /Kết quả hạn chế/.test(await dash.textContent("#historyRows")), (await dash.textContent("#historyRows")).replace(/\s+/g, " ").slice(0, 160));

  await browser.close();
  console.log(log.join("\n"));
  const bad = log.filter((l) => /^(FAIL|PAGEERROR|CONSOLE\.ERR)/.test(l));
  console.log("\n" + (log.length - bad.length) + " dat / " + bad.length + " loi");
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.log(log.join("\n")); console.error("E2E CRASH", e); process.exit(2); });
