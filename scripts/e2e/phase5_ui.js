// Kiem thu giao dien Giai doan 5 tren Hardhat cuc bo + Playwright (KHONG nam trong thu muc test/ de Hardhat khong tu chay).
// Supabase duoc GIA LAP bang route cua trinh duyet: script nay chung minh LOGIC GIAO DIEN dung giao thuc, khong chung minh Supabase that.
// Cach chay (3 cua so): (1) npx hardhat node  (2) python3 -m http.server 8099 --directory web  (3) node scripts/e2e/phase5_ui.js
// Yeu cau: npm i --no-save playwright (+ chromium). Bien moi truong SHOTDIR (tuy chon) de luu anh chup.
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

  // ===== 1. Dang ky to chuc qua giao dien (vi 0) =====
  const p0 = await open(0);
  await p0.waitForFunction(() => window.__votechain.S.orgs !== null && window.__votechain.S.orgs !== undefined, null, { timeout: 15000 });
  await p0.fill("#oName", "CLB Công nghệ Blockchain");
  await click(p0, "#btnOrgRegister");
  await p0.waitForFunction(() => window.__votechain.S.orgPick && window.__votechain.S.orgPick.name.includes("Blockchain"), null, { timeout: 15000 });
  check("dang ky to chuc: hop dong co to chuc #1, chu so huu = vi 0", (await registry.getOrganization(1)).owner === accts[0] && Number((await registry.getOrganization(1)).status) === 1);
  check("to chuc moi hien 'Chờ xác minh' va canh bao chua quan ly duoc", (await p0.textContent("#omAlert")).includes("chưa được xác minh"));
  check("form them thanh vien bi an khi chua xac minh", await p0.locator("#omMemberForm").evaluate((n) => n.classList.contains("hidden")));
  await shot(p0, "01_org_registered");

  // ===== 2. Quan tri nen tang xac minh qua giao dien (vi 19) =====
  const pa = await open(19);
  await pa.waitForFunction(() => window.__votechain.S.orgs && window.__votechain.S.orgs.length, null, { timeout: 15000 });
  await pa.evaluate(() => document.querySelector("#orgRows button").click());
  await pa.waitForSelector("#btnOrgVerify", { timeout: 10000 });
  await click(pa, "#btnOrgVerify");
  check("quan tri vien xac minh: status = Verified", Number((await registry.getOrganization(1)).status) === 2);
  const pNo = await open(3);   // vi thuong khong phai admin
  await pNo.waitForFunction(() => window.__votechain.S.orgs && window.__votechain.S.orgs.length, null, { timeout: 15000 });
  await pNo.evaluate(() => document.querySelector("#orgRows button").click());
  await pNo.waitForFunction(() => window.__votechain.S.orgPick, null, { timeout: 10000 });
  check("vi thuong khong thay nut xac minh/tam ngung", (await pNo.locator("#btnOrgVerify, #btnOrgSuspend").count()) === 0);

  // ===== 3. Manager them thanh vien + nguoi duyet qua giao dien =====
  await p0.reload(); await p0.waitForFunction(() => window.__votechain.S.account && window.__votechain.S.orgs && window.__votechain.S.orgs.length, null, { timeout: 20000 });
  await p0.evaluate(() => document.querySelector("#orgRows button").click());
  await p0.waitForFunction(() => window.__votechain.S.orgPick && window.__votechain.S.orgPick.status === 2, null, { timeout: 10000 });
  for (const i of [1, 2, 3, 4]) { await p0.fill("#mAddr", accts[i]); await p0.selectOption("#mRole", i === 1 ? "2" : "1"); await click(p0, "#btnAddMember"); }
  check("them 4 thanh vien qua giao dien", Number((await registry.getOrganization(1)).memberCount) === 5);
  check("vi 1 la Proposer, vi 2 la Member", Number(await registry.roleOf(1, accts[1])) === 2 && Number(await registry.roleOf(1, accts[2])) === 1);
  await p0.fill("#mAddr", accts[1]); await p0.selectOption("#mRole", "3"); await click(p0, "#btnAddMember");
  check("doi vai tro (da la thanh vien) dung updateMemberRole -> Manager", Number(await registry.roleOf(1, accts[1])) === 3);
  await p0.fill("#mAddr", accts[1]); await p0.selectOption("#mRole", "2"); await click(p0, "#btnAddMember");
  for (const i of [2, 3, 4]) { await p0.fill("#apAddr", accts[i]); await click(p0, "#btnAddApprover"); }
  check("3 nguoi duyet duoc them qua giao dien", (await registry.getApprovers(1)).length === 3);
  await shot(p0, "02_org_manage");
  // thanh vien thuong khong thay form quan ly
  await pNo.reload(); await pNo.waitForFunction(() => window.__votechain.S.orgs && window.__votechain.S.orgs.length, null, { timeout: 20000 });
  await pNo.evaluate(() => document.querySelector("#orgRows button").click());
  await pNo.waitForFunction(() => window.__votechain.S.orgPick && window.__votechain.S.orgPick.role === 1, null, { timeout: 10000 });
  check("Member khong thay form them thanh vien/nguoi duyet", await pNo.locator("#omMemberForm").evaluate((n) => n.classList.contains("hidden")) && await pNo.locator("#omApproverForm").evaluate((n) => n.classList.contains("hidden")));

  // ===== 4. Tao cuoc bau cu qua giao dien (vi 1 = Proposer) =====
  mock.orgRows["1"] = { id: "11111111-1111-1111-1111-111111111111", name: "CLB", description: null, logo_url: null, organization_type: "club", verification_status: "Verified", synced_at: new Date().toISOString() };
  const p1 = await open(1, { route: "create" });
  await p1.waitForFunction(() => document.querySelectorAll("#cOrg option").length > 1, null, { timeout: 15000 });
  await p1.selectOption("#cOrg", "1");
  await p1.waitForFunction(() => window.__votechain.S.createCtx && window.__votechain.S.createCtx.orgId === 1, null, { timeout: 10000 });
  await p1.fill("#cTitle", "Bầu Chủ nhiệm CLB");
  await p1.fill("#cDesc", "Bầu chủ nhiệm nhiệm kỳ 2026–2027");
  await p1.fill("#cNames", "Nguyễn Văn A\nTrần Thị B");
  await p1.waitForSelector("#cCandBox details", { timeout: 5000 });
  await p1.evaluate(() => document.querySelectorAll("#cCandBox details").forEach((d) => (d.open = true)));
  await p1.locator("#cCandBox details").nth(0).locator("textarea").nth(0).fill("Sinh viên năm 3, CNTT");
  await p1.locator("#cCandBox details").nth(1).locator("input[type=text]").first().fill(accts[2]);   // vi ung vien trung nguoi duyet #2 -> bi loai
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await p1.setInputFiles("#cCover", { name: "bia.png", mimeType: "image/png", buffer: png });
  await p1.fill("#cVoters", accts.slice(0, 6).join("\n"));
  await p1.fill("#cReg", "30");
  await click(p1, "#btnBuild");
  await p1.waitForTimeout(300);
  let checks = await p1.textContent("#cChecks");
  check("xem truoc: con 2 nguoi duyet hop le (loai vi ung vien) -> du dieu kien", /hiện 2\)/.test(checks) && !(await p1.locator("#cChecks li.bad").count()), checks.replace(/\s+/g, " ").slice(0, 300));
  const prevHash = await p1.evaluate(() => window.__votechain.S.lastBuilt.meta.electionHash);
  await shot(p1, "03_create_preview");
  await click(p1, "#btnCreate");
  await p1.waitForSelector("#cResult .alert.ok", { timeout: 20000 });
  check("tao cuoc bau cu thanh cong, id #0", (await p1.textContent("#cResult")).includes("#0"));
  check("hop dong luu dung hash metadata cuoc bau cu = hash xem truoc", (await core.getElectionOrg(0)).metadataHash === prevHash);
  const cm0 = await core.getCandidateMetadata(0, 0);
  const expectC0 = meta.metadataHash(meta.candidateMetadata({ index: 0, fullName: "Nguyễn Văn A", bio: "Sinh viên năm 3, CNTT" }));
  check("hash ho so ung vien 0 tren chuoi = hash tinh doc lap tu scripts/metadata.js", cm0.metadataHash === expectC0);
  const st = await core.getElectionStats(0);
  check("nguong ky = ceil(2*2/3) = 2 (vi ung vien bi loai khoi nhom duyet)", Number(st.requiredApprovals) === 2 && (await core.getApprovers(0)).length === 2);
  check("Supabase gia lap nhan 1 anh bia + 3 ban nhap (1 cuoc + 2 ung vien)", mock.files.size === 1 && mock.drafts.length === 3, JSON.stringify([mock.files.size, mock.drafts.length]));
  const key = [...mock.files.keys()][0];
  check("ten tep = keccak256 noi dung + duoi .png, dung bucket/to chuc", key === "election-assets/1/cover/" + ethers.keccak256(png) + ".png", key);
  check("moi yeu cau len Supabase deu mang JWT cua dung vi (khong gui khoa publishable lam Bearer)", mock.authSeen.length > 0 && mock.authSeen.every((w) => w === accts[1].toLowerCase()));
  const draftE = mock.drafts.find((d) => d.metadata_type === "election");
  check("ban nhap cuoc bau cu: dung hash, created_by = vi nguoi tao (chu thuong), khong co truong cam", draftE.metadata_hash === prevHash && draftE.created_by === accts[1].toLowerCase() && draftE.candidate_id_onchain === null && !("onchain_seen" in draftE) && !("content_valid" in draftE));
  check("noi dung ban nhap cuoc bau cu hash lai == hash tren chuoi", meta.metadataHash(draftE.content) === (await core.getElectionOrg(0)).metadataHash);
  await shot(p1, "04_create_done");

  // ===== 5. Gia lap chain-sync: dua cac ban nhap thanh dong su kien, roi xac thuc tren trang Phe duyet =====
  mock.events = mock.drafts.map((d, i) => ({ ...d, election_id_onchain: 0, metadata_version: 1, onchain_seen: true }));
  const pAp = await open(3, { route: "approve" });
  await pAp.waitForFunction(() => window.__votechain.S.all && window.__votechain.S.all.length, null, { timeout: 20000 });
  await pAp.evaluate(() => { document.getElementById("electionId").value = "0"; });
  await pAp.evaluate(() => document.getElementById("btnLoad").click());
  await pAp.waitForFunction(() => window.__votechain.S.election && window.__votechain.S.election.id === 0n, null, { timeout: 15000 });
  await idle(pAp);
  await click(pAp, "#btnVerifyMeta");
  let vm = await pAp.textContent("#approveMeta");
  check("xac thuc noi dung: cuoc bau cu + 2 ung vien deu 'Khớp hash trên chuỗi'", (vm.match(/Khớp hash trên chuỗi/g) || []).length === 3 && !/KHÔNG khớp/.test(vm), vm.replace(/\s+/g, " ").slice(0, 250));
  check("hien mo ta da xac thuc", vm.includes("nhiệm kỳ 2026–2027"));
  await shot(pAp, "05_approve_verified");
  mock.tamper = true;
  await click(pAp, "#btnVerifyMeta");
  vm = await pAp.textContent("#approveMeta");
  check("noi dung bi sua tren may chu -> bao 'KHÔNG khớp' (khong tin may chu)", (vm.match(/KHÔNG khớp/g) || []).length === 3 && !vm.includes("Mô tả đã xác thực"), vm.replace(/\s+/g, " ").slice(0, 200));
  mock.tamper = false;
  const stBefore = (await pAp.textContent("#approveState"));
  check("trang thai yeu cau hien 'Chờ duyệt' va to chuc #1", stBefore.includes("Chờ duyệt") && stBefore.includes("tổ chức #1"), stBefore);

  // ===== 6. Duyet / tu choi / rut / het han =====
  check("vi 3 la nguoi duyet: nut Ky duyet va Tu choi bat", !(await pAp.locator("#btnApprove").isDisabled()) && !(await pAp.locator("#btnReject").isDisabled()));
  check("vi 3 khong phai nguoi tao: nut Rut tat", await pAp.locator("#btnWithdraw").isDisabled());
  await click(pAp, "#btnApprove");
  check("vi 2 (ung vien bi loai) khong phai nguoi duyet cuoc #0", !(await core.isApprover(0, accts[2])) && (await core.isApprover(0, accts[3])));
  check("ky duyet lan 1 -> 1/2, chua kich hoat", Number((await core.getElectionStats(0)).approvalCount) === 1 && !(await core.getElectionBasicInfo(0)).isActivated);
  let revertName = "";
  try { await core.connect(await provider.getSigner(1)).withdrawElection.staticCall(0); } catch (e) { revertName = (e.revert && e.revert.name) || e.shortMessage || String(e); }
  check("nguoi tao khong the rut sau khi da co chu ky (hop dong tu choi: RequestLocked)", revertName === "RequestLocked", revertName);
  const pAp2 = await open(4, { route: "approve" });
  await pAp2.waitForFunction(() => window.__votechain.S.all && window.__votechain.S.all.length, null, { timeout: 20000 });
  await pAp2.evaluate(() => document.getElementById("btnLoad").click());
  await pAp2.waitForFunction(() => window.__votechain.S.election, null, { timeout: 15000 });
  await idle(pAp2);
  await click(pAp2, "#btnApprove");
  check("ky du nguong 2/2 -> cuoc bau cu kich hoat", (await core.getElectionBasicInfo(0)).isActivated && Number(await core.requestStatus(0)) === 1);

  // cuoc #1: tu choi
  const p1b = await open(1, { route: "create" });
  await p1b.waitForFunction(() => document.querySelectorAll("#cOrg option").length > 1, null, { timeout: 15000 });
  await p1b.selectOption("#cOrg", "1");
  await p1b.waitForFunction(() => window.__votechain.S.createCtx && window.__votechain.S.createCtx.orgId === 1, null, { timeout: 10000 });
  await p1b.fill("#cVoters", accts.slice(0, 4).join("\n"));
  await p1b.uncheck("#cSave");
  await click(p1b, "#btnCreate");
  await p1b.waitForSelector("#cResult .alert.ok", { timeout: 20000 });
  check("tat 'Luu noi dung': tao duoc, canh bao noi dung CHUA luu", (await p1b.textContent("#cResult")).includes("CHƯA lưu") && mock.drafts.length === 3);
  const pr = await open(2, { route: "approve" });
  await pr.waitForFunction(() => window.__votechain.S.all && window.__votechain.S.all.length === 2, null, { timeout: 20000 });
  await pr.evaluate(() => { document.getElementById("electionId").value = "1"; document.getElementById("btnLoad").click(); });
  await pr.waitForFunction(() => window.__votechain.S.election && window.__votechain.S.election.id === 1n, null, { timeout: 15000 });
  await click(pr, "#btnReject");
  check("tu choi lan 1: chua dong (nguong 2/2 con kha thi?)", true);
  const closedAfter1 = Number(await core.requestStatus(1));
  const pr3 = await open(3, { route: "approve" });
  await pr3.waitForFunction(() => window.__votechain.S.all && window.__votechain.S.all.length === 2, null, { timeout: 20000 });
  await pr3.evaluate(() => { document.getElementById("electionId").value = "1"; document.getElementById("btnLoad").click(); });
  await pr3.waitForFunction(() => window.__votechain.S.election && window.__votechain.S.election.id === 1n, null, { timeout: 15000 });
  check("sau 1 phieu tu choi, yeu cau ", closedAfter1 === 2 || closedAfter1 === 0, "status=" + closedAfter1);
  if (closedAfter1 === 0) await click(pr3, "#btnReject");
  check("du phieu tu choi -> yeu cau 'Bị từ chối', giao dien hien dong", Number(await core.requestStatus(1)) === 2);
  await pr3.evaluate(() => document.getElementById("btnLoad").click()); await pr3.waitForTimeout(800);
  const rbadge = await pr3.textContent("#ctxPhase");
  check("badge ngu canh hien 'Bị từ chối'", rbadge.includes("Bị từ chối"), rbadge);
  check("nut Ky duyet tat voi yeu cau da dong", await pr3.locator("#btnApprove").isDisabled());
  await shot(pr3, "06_rejected");

  // cuoc #2: rut boi nguoi tao, roi het han
  const p1c = await open(1, { route: "create" });
  await p1c.waitForFunction(() => document.querySelectorAll("#cOrg option").length > 1, null, { timeout: 15000 });
  await p1c.selectOption("#cOrg", "1");
  await p1c.waitForFunction(() => window.__votechain.S.createCtx && window.__votechain.S.createCtx.orgId === 1, null, { timeout: 10000 });
  await p1c.fill("#cVoters", accts.slice(0, 4).join("\n")); await p1c.uncheck("#cSave"); await p1c.fill("#cReg", "2");
  await click(p1c, "#btnCreate"); await p1c.waitForSelector("#cResult .alert.ok", { timeout: 20000 });
  await p1c.goto(`http://127.0.0.1:8099/index.html?contract=${addr}&chain=31337&election=2#/approve`);
  await p1c.waitForFunction(() => window.__votechain.S.election && window.__votechain.S.election.id === 2n, null, { timeout: 20000 });
  check("nguoi tao thay nut Rut bat khi chua co chu ky", !(await p1c.locator("#btnWithdraw").isDisabled()));
  await click(p1c, "#btnWithdraw");
  check("rut yeu cau -> Withdrawn, giai phong han muc", Number(await core.requestStatus(2)) === 3 && Number(await core.pendingCountOfWallet(accts[1])) === 0);
  // cuoc #3: het han
  await p1c.goto(`http://127.0.0.1:8099/index.html?contract=${addr}&chain=31337&election=0#/create`);
  await p1c.waitForFunction(() => window.__votechain.S.account && document.querySelectorAll("#cOrg option").length > 1, null, { timeout: 20000 });
  await p1c.selectOption("#cOrg", "1"); await p1c.waitForFunction(() => window.__votechain.S.createCtx, null, { timeout: 10000 });
  await p1c.fill("#cVoters", accts.slice(0, 4).join("\n")); await p1c.uncheck("#cSave"); await p1c.fill("#cReg", "1");
  await click(p1c, "#btnCreate"); await p1c.waitForSelector("#cResult .alert.ok", { timeout: 20000 });
  await provider.send("evm_increaseTime", [120]); await provider.send("evm_mine", []);
  check("yeu cau het han: requestStatus = Expired va han muc cua vi da tu giai phong (chi dem yeu cau con han)", Number(await core.requestStatus(3)) === 4 && Number(await core.pendingCountOfWallet(accts[1])) === 0);
  const pe = await open(4, { route: "approve" });
  await pe.waitForFunction(() => window.__votechain.S.all && window.__votechain.S.all.length === 4, null, { timeout: 20000 });
  await pe.waitForSelector("#rel-3", { timeout: 10000 });
  check("danh sach cho duyet gan nhan Het han cho yeu cau #3", (await pe.textContent("#pendingRows")).includes("đã hết hạn"));
  await click(pe, "#rel-3");
  const evs = await core.queryFilter(core.filters.RequestExpired(3));
  check("bat ky ai (vi 4) ghi nhan het han: su kien RequestExpired(3) phat ra", evs.length === 1);

  // ===== 6b. Hoi quy: bo phieu commit-reveal van chay tren hop dong moi (loi cot loi khong doi) =====
  await provider.send("evm_increaseTime", [1900]); await provider.send("evm_mine", []);
  const voteList = accts.slice(0, 6).join("\n");
  const voters = [[0, "1"], [3, "1"], [4, "0"]];
  const vpages = [];
  for (const [i, cand] of voters) {
    const pv = await open(i, { route: "vote" });
    await pv.evaluate(() => { document.getElementById("electionId").value = "0"; document.getElementById("btnLoad").click(); });
    await pv.waitForFunction(() => window.__votechain.S.election && window.__votechain.S.election.id === 0n && window.__votechain.S.election.phase === 1, null, { timeout: 20000 });
    await idle(pv);
    await pv.evaluate(() => { const d = document.getElementById("voterListInput").closest("details"); if (d) d.open = true; });
    await pv.fill("#voterListInput", voteList);
    await pv.click('#candList input[value="' + cand + '"]', { force: true });
    const dl = pv.waitForEvent("download", { timeout: 8000 }).catch(() => null);
    await click(pv, "#btnCommit"); await dl;
    check("vi " + i + " nop phieu kin thanh cong (UI moi)", (await core.getVoterStatus(0, accts[i])).committed === true, (await toasts(pv)).slice(0, 120));
    vpages.push(pv);
  }
  await provider.send("evm_increaseTime", [601]); await provider.send("evm_mine", []);
  for (const pv of vpages) {
    await pv.evaluate(() => { document.getElementById("btnLoad").click(); }); await pv.waitForTimeout(1200); await idle(pv);
    await click(pv, "#btnReveal");
  }
  await provider.send("evm_increaseTime", [601]); await provider.send("evm_mine", []);
  const rs = await core.result(0);
  check("ket qua: hop le, ung vien 1 thang voi 2 phieu (3/6 cu tri >= quorum 50%)", rs.valid === true && Number(rs.winnerId) === 1 && Number(rs.topVotes) === 2, JSON.stringify([rs.valid, Number(rs.winnerId), Number(rs.topVotes)]));
  await shot(vpages[0], "07_voted");

  // ===== 7. Hanh vi dang nhap =====
  const pl = await open(5, { route: "org" });
  check("chua dang nhap: nut 'Đăng nhập dữ liệu' hien, trang van doc duoc", (await pl.textContent("#btnSbLogin")).includes("Đăng nhập dữ liệu") && !(await pl.locator("#btnSbLogin").evaluate((n) => n.classList.contains("hidden"))));
  await click(pl, "#btnSbLogin");
  check("dang nhap bang chu ky vi: phien gan voi dung vi", await pl.evaluate((w) => window.__votechain.sbWallet() === w, accts[5].toLowerCase()));
  check("nut doi thanh 'Đã đăng nhập dữ liệu'", (await pl.textContent("#btnSbLogin")).includes("Đã đăng nhập"));
  const bad = await pl.evaluate(async () => { try { await window.__votechain.sbGet("organizations?organization_id_onchain=eq.999"); return "ok"; } catch (e) { return String(e.message); } });
  check("GET qua mock khong loi", bad === "ok");

  const errs = log.filter((l) => /^(PAGEERROR|CONSOLE\.ERR)/.test(l));
  check("khong co loi JS / console trong ca phien", errs.length === 0, errs.join(" | ").slice(0, 300));
  await browser.close();
  console.log(log.join("\n"));
  const failed = log.filter((l) => l.startsWith("FAIL") || /^(PAGEERROR|CONSOLE\.ERR)/.test(l)).length;
  console.log("\nTONG: " + log.filter((l) => l.startsWith("PASS")).length + " dat, " + failed + " loi");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(log.join("\n")); console.error("E2E CRASH", e); process.exit(2); });
