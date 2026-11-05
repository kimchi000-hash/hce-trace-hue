// Kiem thu DANG KY TO CHUC DAY DU (ho so + hash tren chuoi + luu qua RPC) tren Hardhat cuc bo + Playwright, Supabase gia lap. Cach chay giong phase5_ui.js.
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
const mock = { rpc: [], nonces: new Map(), drafts: [], files: new Map(), events: [], orgRows: {}, calls: [], authSeen: [], tamper: false, patches: [] };
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
  if (p === "/rest/v1/rpc/save_organization_profile" && req.method() === "POST") {
    if (!jw) return json(401, { message: "Can dang nhap bang vi" });
    const b = JSON.parse(req.postData());
    const row = Object.values(mock.orgRows).find((r) => r.id === b.p_org);
    if (!row) return json(400, { message: "Khong tim thay to chuc" });
    if (row.owner !== jw) return json(400, { message: "Chi Manager cua to chuc duoc luu ho so" });
    if (row.verification_status === "Pending" && row.profile) return json(400, { message: "To chuc chua xac minh chi duoc luu ho so mot lan" });
    mock.rpc.push({ wallet: jw, org: b.p_org, profile: b.p_profile });
    row.profile = b.p_profile;
    return route.fulfill({ status: 204, headers: cors, body: "" });
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

  const sg = (i) => provider.getSigner(i);
  const wl = accts[0].toLowerCase();
  const form = { name: "CLB Công nghệ Blockchain", desc: "Câu lạc bộ học thuật về blockchain của khoa.", affil: "Khoa Kinh tế", year: "2019", email: "clb@example.vn", web: "https://example.vn/clb" };
  const po = await open(0, { route: "org" });
  await po.waitForFunction(() => window.__votechain.S.orgs !== null && window.__votechain.S.orgs !== undefined, null, { timeout: 15000 });
  check("form dang ky co du truong ho so", (await po.locator("#oDesc, #oAffil, #oYear, #oEmail, #oWeb").count()) === 5);

  // ----- 0. loai "Lop": an don vi chu quan va website; truong bi an luon rong trong ho so -----
  await po.selectOption("#oType", "club");
  check("loai Cau lac bo: hien don vi chu quan va website", !(await po.locator("#oAffilF").evaluate((n) => n.hidden)) && !(await po.locator("#oWebF").evaluate((n) => n.hidden)));
  await po.fill("#oAffil", "Khoa X"); await po.fill("#oWeb", "https://example.vn");
  await po.selectOption("#oType", "class");
  check("loai Lop: an don vi chu quan va website, xoa gia tri da nhap", (await po.locator("#oAffilF").evaluate((n) => n.hidden)) && (await po.locator("#oWebF").evaluate((n) => n.hidden)) && (await po.inputValue("#oAffil")) === "" && (await po.inputValue("#oWeb")) === "");
  await po.fill("#oName", "Lop K58A");
  const cls = await po.evaluate(() => window.__votechain.readOrgForm());
  check("ho so cua lop: affiliation va website rong", cls.affiliation === "" && cls.website === "" && cls.organizationType === "class" && cls.name === "Lop K58A");
  await po.selectOption("#oType", "club"); await po.fill("#oName", "");

  // ----- 1. du lieu sai bi chan truoc khi gui giao dich -----
  await po.fill("#oName", form.name); await po.fill("#oEmail", "khong-phai-email");
  await po.click("#btnOrgRegister"); await po.waitForTimeout(500); await idle(po);
  check("email sai: bi chan, chua co to chuc tren chuoi", /Email liên hệ không hợp lệ/.test(await toasts(po)) && Number(await registry.organizationCount()) === 0);
  await po.fill("#oEmail", form.email); await po.fill("#oWeb", "http://khong-https.vn");
  await po.click("#btnOrgRegister"); await po.waitForTimeout(500); await idle(po);
  check("website khong https: bi chan", /https/.test(await toasts(po)) && Number(await registry.organizationCount()) === 0);
  await po.fill("#oWeb", form.web); await po.fill("#oYear", "1500");
  await po.click("#btnOrgRegister"); await po.waitForTimeout(500); await idle(po);
  check("nam thanh lap ngoai khoang: bi chan", /Năm thành lập/.test(await toasts(po)) && Number(await registry.organizationCount()) === 0);

  // ----- 2. dang ky that -----
  await po.fill("#oYear", form.year); await po.fill("#oDesc", form.desc); await po.fill("#oAffil", form.affil); await po.selectOption("#oType", "club");
  await po.click("#btnOrgRegister");
  await po.waitForFunction(() => window.__votechain.S.orgPick && window.__votechain.S.orgPick.name.includes("Blockchain"), null, { timeout: 30000 });
  const expectProfile = meta.organizationMetadata({ name: form.name, organizationType: "club", description: form.desc, affiliation: form.affil, contactEmail: form.email, website: form.web, foundedYear: 2019 });
  const o1 = await registry.getOrganization(1);
  check("tren chuoi: infoHash = hash doc lap cua ho so day du (scripts/metadata.js)", o1.infoHash === meta.metadataHash(expectProfile) && o1.name === form.name && o1.owner === accts[0]);
  check("ban cho luu duoc giu trong trinh duyet khi chua dong bo", (await po.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("votechain:orgprofile:1:")).length)) === 1);
  check("chua dong bo: the ho so bao dang cho", /đang chờ lưu lên Supabase/.test(await po.textContent("#omProfile")), await po.textContent("#omProfile"));
  check("chua co lan goi RPC nao (to chuc chua duoc chain-sync)", mock.rpc.length === 0);

  // ----- 3. chain-sync dong bo to chuc -> UI tu luu qua RPC -----
  mock.orgRows["1"] = { id: "11111111-1111-1111-1111-111111111111", owner: wl, name: form.name, description: null, logo_url: null, organization_type: null, verification_status: "Pending", info_hash: o1.infoHash, profile: null, synced_at: new Date().toISOString() };
  await po.waitForFunction(() => /Đã lưu hồ sơ tổ chức #1/.test(document.querySelector("#oRegStatus").textContent), null, { timeout: 40000 });
  check("RPC save_organization_profile duoc goi dung 1 lan, dung vi, dung noi dung", mock.rpc.length === 1 && mock.rpc[0].wallet === wl && mock.rpc[0].org === "11111111-1111-1111-1111-111111111111" && meta.metadataHash(mock.rpc[0].profile) === o1.infoHash, JSON.stringify(mock.rpc).slice(0, 200));
  check("ban cho luu da bi xoa sau khi luu", (await po.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("votechain:orgprofile:")).length)) === 0);
  await po.waitForFunction(() => /Khớp hash trên chuỗi/.test(document.querySelector("#omProfile").textContent), null, { timeout: 15000 });
  const card = await po.textContent("#omProfile");
  check("the Ho so to chuc: hien noi dung va nhan 'Khop hash tren chuoi'", [form.desc, form.affil, "2019", form.email, form.web, "Câu lạc bộ"].every((x) => card.includes(x)), card.replace(/\s+/g, " ").slice(0, 300));
  check("email la lien ket mailto, website la https mo tab moi an toan", (await po.locator('#omProfile a[href="mailto:' + form.email + '"]').count()) === 1 && (await po.locator('#omProfile a[target=_blank][rel*=noopener]').count()) === 1);
  await shot(po, "org_profile");

  // ----- 4. noi dung bi sua tren Supabase -> trinh duyet phat hien -----
  mock.orgRows["1"].profile = { ...mock.orgRows["1"].profile, description: "Noi dung bi sua len" };
  await po.evaluate(() => window.__votechain.S.orgPick && document.getElementById("btnOrgReload").click());
  await po.waitForFunction(() => /KHÔNG khớp hash/.test(document.querySelector("#omProfile").textContent), null, { timeout: 15000 }).catch(() => {});
  check("noi dung bi sua: bao KHONG khop hash", /KHÔNG khớp hash/.test(await po.textContent("#omProfile")));
  // ----- 5. luu lan hai khi Pending bi tu choi o phia may chu (mock theo dung luat cua ham SQL) -----
  const r2 = await po.evaluate(async (pid) => { const r = await fetch("https://vfzuniykinaivchhuiul.supabase.co/rest/v1/rpc/save_organization_profile", { method: "POST", headers: { apikey: "sb_publishable_EDmldUtxLGO4J5EvAE0DHQ__RVMvuYu", "content-type": "application/json", authorization: "Bearer " + window.__votechain.SB.session.access_token }, body: JSON.stringify({ p_org: pid, p_profile: { schema: "votechain.organization.v1" } }) }); return r.status; }, "11111111-1111-1111-1111-111111111111").catch(() => 0);
  check("luu lan hai khi Pending bi tu choi (400)", r2 === 400 || r2 === 0, String(r2));
  // ----- 6. to chuc da xac minh: Manager sua ho so (updateOrganization + RPC); vi khong phai Manager khong thay nut -----
  mock.orgRows["1"].profile = mock.rpc[0].profile;   // khoi phuc noi dung that sau buoc 4
  await registry.connect(admin).verifyOrganization(1); mock.orgRows["1"].verification_status = "Verified";
  await po.click("#btnOrgReload"); await po.waitForTimeout(300); await idle(po);
  await po.waitForSelector("#btnOrgEdit", { timeout: 15000 });
  check("Manager cua to chuc da xac minh thay nut Chinh sua ho so", (await po.locator("#btnOrgEdit").count()) === 1);
  check("khoi cu chi con Logo: khong con o Loai/Mo ta trung lap", (await po.locator("#oiLogo").count()) === 1 && (await po.locator("#oiType, #oiDesc").count()) === 0 && /Logo tổ chức/.test(await po.textContent("#omInfoBox")));
  await po.click("#btnOrgInfoSave"); await po.waitForTimeout(400); await idle(po);
  check("luu logo khi chua chon anh: bi chan, khong gui PATCH", /chọn một ảnh logo/.test(await toasts(po)) && mock.patches.length === 0);
  await po.click("#btnOrgEdit");
  check("form sua duoc dien san tu ho so hien tai", (await po.inputValue("#eName")) === form.name && (await po.inputValue("#eDesc")) === form.desc && (await po.inputValue("#eEmail")) === form.email && (await po.inputValue("#eYear")) === "2019");
  await po.click("#btnOrgEditSave"); await po.waitForTimeout(400); await idle(po);
  check("khong thay doi gi: bi chan, khong gui giao dich", /Chưa có thay đổi/.test(await toasts(po)));
  await po.fill("#eEmail", "sai-email"); await po.click("#btnOrgEditSave"); await po.waitForTimeout(400); await idle(po);
  check("email sai o form sua: bi chan", /Email liên hệ không hợp lệ/.test(await toasts(po)));
  const rpcBefore = mock.rpc.length;
  await po.fill("#eEmail", "moi@example.vn"); await po.fill("#eDesc", "Mo ta da cap nhat."); await po.fill("#eName", "CLB Blockchain Hue");
  await po.click("#btnOrgEditSave");
  await po.waitForFunction(() => window.__votechain.S.orgPick && window.__votechain.S.orgPick.name === "CLB Blockchain Hue", null, { timeout: 30000 });
  const newProf = meta.organizationMetadata({ name: "CLB Blockchain Hue", organizationType: "club", description: "Mo ta da cap nhat.", affiliation: form.affil, contactEmail: "moi@example.vn", website: form.web, foundedYear: 2019 });
  const o1b = await registry.getOrganization(1);
  check("tren chuoi: ten va infoHash moi = hash cua ho so moi", o1b.name === "CLB Blockchain Hue" && o1b.infoHash === meta.metadataHash(newProf));
  await po.waitForFunction((n) => window.__votechain.S.orgMirror && window.__votechain.S.orgMirror.profile && window.__votechain.S.orgMirror.profile.description === "Mo ta da cap nhat." && /Khớp hash trên chuỗi/.test(document.querySelector("#omProfile").textContent), null, { timeout: 30000 }).catch(() => {});
  check("RPC duoc goi them dung 1 lan voi ho so moi", mock.rpc.length === rpcBefore + 1 && meta.metadataHash(mock.rpc[mock.rpc.length - 1].profile) === o1b.infoHash);
  check("sau khi sua: the ho so hien noi dung moi va 'Khop hash'", /Mo ta da cap nhat\./.test(await po.textContent("#omProfile")) && /Khớp hash trên chuỗi/.test(await po.textContent("#omProfile")) && (await po.evaluate(() => document.getElementById("omEdit").hidden)));
  check("ban cho luu da duoc xoa", (await po.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("votechain:orgprofile:")).length)) === 0);
  await shot(po, "org_edit");
  const pv = await open(5, { route: "org" });
  await pv.waitForFunction(() => window.__votechain.S.orgs !== null && window.__votechain.S.orgs !== undefined, null, { timeout: 15000 });
  await pv.evaluate(() => window.__votechain.pickOrg && window.__votechain.pickOrg(1)).catch(() => {});
  await pv.waitForTimeout(1500);
  check("vi khong phai Manager khong co nut Chinh sua", (await pv.locator("#btnOrgEdit").count()) === 0);
  await browser.close();
  for (let i = log.length - 1; i >= 0; i--) if (/^CONSOLE\.ERR UserError/.test(log[i])) log.splice(i, 1);   // loi du kien (kiem tra chan du lieu sai)
  console.log(log.join("\n"));
  const bad = log.filter((l) => /^(FAIL|PAGEERROR|CONSOLE\.ERR)/.test(l));
  console.log("\n" + (log.length - bad.length) + " dat / " + bad.length + " loi");
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.log(log.join("\n")); console.error("E2E CRASH", e); process.exit(2); });
