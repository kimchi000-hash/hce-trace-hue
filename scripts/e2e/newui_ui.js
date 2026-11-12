// Kiểm thử giao diện mới: hộp Cài đặt hợp đồng, bảng "Việc cần làm", chọn nhanh quorum theo %, thanh bên gom nhóm,
// hướng dẫn cài ví khi không có MetaMask, bố cục trang bỏ phiếu. Supabase giả lập (404 hết).
const fs = require("fs");
const ROOT = require("path").resolve(__dirname, "..", "..");
const S = process.env.SHOTDIR || require("os").tmpdir();
const { ethers } = require(ROOT + "/node_modules/ethers");
const { chromium } = require("playwright");
const reg = require(ROOT + "/artifacts/contracts/project/OrganizationRegistry.sol/OrganizationRegistry.json");
const coreArt = require(ROOT + "/artifacts/contracts/project/ProjectCore.sol/ProjectCore.json");
const meta = require(ROOT + "/scripts/metadata.js");
const { buildTree } = require(ROOT + "/scripts/merkle");
const RPC = "http://127.0.0.1:8545";
const SB = "https://vfzuniykinaivchhuiul.supabase.co";
const ETHERS_UMD = fs.readFileSync(ROOT + "/node_modules/ethers/dist/ethers.umd.min.js", "utf8");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const log = [];
const check = (n, ok, x) => log.push((ok ? "PASS " : "FAIL ") + n + (x ? " :: " + x : ""));
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const accts = (await provider.send("eth_accounts", [])).map(ethers.getAddress);
  const admin = await provider.getSigner(19);
  const registry = await new ethers.ContractFactory(reg.abi, reg.bytecode, admin).deploy(); await registry.waitForDeployment();
  const core = await new ethers.ContractFactory(coreArt.abi, coreArt.bytecode, admin).deploy(await registry.getAddress()); await core.waitForDeployment();
  const addr = await core.getAddress();
  const sg = (i) => provider.getSigner(i);
  const R = registry.connect(await sg(0)), P = registry.connect(admin);
  await (await R.registerOrganization("CLB Tin học", ethers.id("org"))).wait();
  await (await P.verifyOrganization(1)).wait();
  for (const i of [1, 2]) { await (await R.addMember(1, accts[i], 1)).wait(); await (await R.addApprover(1, accts[i])).wait(); }

  const voters = [accts[3], accts[4], accts[5]];
  const tree = buildTree(voters);
  // 3 cuộc, mỗi cuộc một ảnh bìa riêng; nội dung băm khớp hash trên chuỗi
  const contents = [];
  for (let i = 0; i < 3; i++) {
    const c = meta.electionMetadata({ organizationId: 1, title: "Cuộc " + i, description: "Mô tả cuộc " + i, cover: { url: SB + "/storage/v1/object/public/election-assets/cover-" + i + ".png", mime: "image/png", checksum: "0x" + String(i).repeat(64), size: 70 } });
    contents.push(c);
    await (await core.connect(await sg(0)).createElection({
      organizationId: 1, title: "Cuộc " + i, names: ["Nguyễn Văn A", "Trần Thị B"], candidateWallets: [],
      regMinutes: 60, commitMinutes: 60, revealMinutes: 60, quorumBps: 5000, voterCount: tree.voterCount, merkleRoot: tree.root,
      metadataHash: meta.metadataHash(c), candidateMetadataHashes: [ethers.id("a" + i), ethers.id("b" + i)],
    })).wait();
    if (i < 2) for (const j of [1, 2]) await (await core.connect(await sg(j)).approveElection(i)).wait();   // tránh chạm hạn mức chờ duyệt
  }
  // đổi tên tổ chức SAU khi đã xác minh (Manager ví 0)
  await (await R.updateOrganization(1, "Đoàn trường ĐH Kinh tế", ethers.id("org2"))).wait();

  const browser = await chromium.launch();
  async function open(idx, query, init) {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    await ctx.route("**/ethers.umd.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: ETHERS_UMD }));
    await ctx.route(SB + "/**", (route) => {
      const req = route.request(), u = new URL(req.url()), p = u.pathname;
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (p.startsWith("/storage/v1/object/public/election-assets/cover-")) return route.fulfill({ status: 200, headers: { ...cors, "content-type": "image/png" }, body: PNG });
      if (p === "/rest/v1/metadata_history" && req.method() === "GET") {
        const hashes = (/metadata_hash=in\.\(([^)]*)\)/.exec(u.search) || [, ""])[1].split(",").map((x) => x.toLowerCase());
        const rows = contents.filter((c) => hashes.includes(meta.metadataHash(c).toLowerCase())).map((c) => ({ metadata_hash: meta.metadataHash(c), content: c }));
        return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(rows) });
      }
      if (p === "/rest/v1/elections_chain") return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: "[]" });
      return route.fulfill({ status: 404, headers: { ...cors, "content-type": "application/json" }, body: "{}" });
    });
    await ctx.route("https://ethereum-sepolia-rpc.publicnode.com/**", async (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: route.request().postData() });
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: await r.text() });
    });
    await ctx.addInitScript(({ acct }) => {
      const call = async (method, params) => { const r = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }) }); const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; throw e; } return j.result; };
      window.ethereum = { request: async ({ method, params }) => (method === "eth_requestAccounts" || method === "eth_accounts") ? [acct] : call(method, params), on() {} };
    }, { acct: accts[idx] });
    const page = await ctx.newPage();
    page.errs = [];
    page.on("pageerror", (e) => page.errs.push(e.message));
    await page.goto("http://127.0.0.1:8099/index.html?contract=" + addr + "&chain=31337" + (query || "") + "#/dashboard");
    await page.waitForFunction(() => window.__votechain && window.__votechain.S.all && window.__votechain.S.all.length === 3, null, { timeout: 25000 });
    return { page, ctx };
  }
  // ---------- 1) ví người duyệt (accts[1]): bảng việc cần làm + hộp cài đặt ----------
  let { page: p, ctx } = await open(1);
  await p.waitForFunction(() => window.__votechain.S.account, null, { timeout: 10000 });
  await p.evaluate(() => { location.hash = "#/dashboard"; });
  await p.waitForFunction(() => document.querySelectorAll("#hubList .hub-item").length >= 1, null, { timeout: 10000 });
  const hub = await p.evaluate(() => ({ title: document.getElementById("hubTitle").textContent, items: [...document.querySelectorAll("#hubList .hub-item")].map((n) => n.textContent) }));
  check("(hub) co ket noi vi: loi chao Chao mung + muc 'Can ban ky duyet' cho cuoc #2", /Chào mừng/.test(hub.title) && hub.items.some((t) => /Cần bạn ký duyệt/.test(t) && /Cuộc 2/.test(t)), JSON.stringify(hub));
  await p.click("#hubList .hub-item.approve button");
  await p.waitForFunction(() => location.hash === "#/approve", null, { timeout: 8000 });
  check("(hub) bam 'Xem & Ky duyet' -> sang trang Phe duyet, nut Ky duyet co mat", (await p.locator("#btnApprove").count()) === 1);
  const adv = await p.evaluate(() => { const d = document.querySelector("details.nav-adv"); return { exists: !!d, open: d && d.open }; });
  check("(thanh ben) muc 'Ho tro & Nang cao' ton tai, mac dinh gap khi o trang chinh", adv.exists && adv.open === false, JSON.stringify(adv));
  await p.evaluate(() => { location.hash = "#/log"; });
  await p.waitForTimeout(300);
  check("(thanh ben) vao Nhat ky -> muc Ho tro tu mo ra", await p.evaluate(() => document.querySelector("details.nav-adv").open));

  // hộp Cài đặt hợp đồng
  check("(cai dat) hop cai dat dang an luc moi vao", await p.evaluate(() => document.getElementById("settingsModal").classList.contains("hidden")));
  await p.click("#btnOpenSettings");
  check("(cai dat) bam nut -> hop mo, co o dia chi hop dong", await p.evaluate(() => !document.getElementById("settingsModal").classList.contains("hidden") && !!document.getElementById("cfgAddress").value));
  await p.keyboard.press("Escape");
  check("(cai dat) Esc dong hop", await p.evaluate(() => document.getElementById("settingsModal").classList.contains("hidden")));
  await p.click("#btnOpenSettings");
  await p.click("#btnLoad");
  await p.waitForFunction(() => document.getElementById("settingsModal").classList.contains("hidden"), null, { timeout: 15000 });
  check("(cai dat) bam 'Tai' xong -> hop tu dong dong, cuoc bau cu van tai duoc", await p.evaluate(() => !!window.__votechain.S.election));

  // ---------- 2) form tạo cuộc: quorum theo % ----------
  await p.evaluate(() => { location.hash = "#/create"; });
  await p.waitForSelector("#cQuorumPct", { state: "visible" });
  check("(quorum) mac dinh 50% -> gia tri an = 5000", (await p.inputValue("#cQuorumPct")) === "50" && (await p.inputValue("#cQuorum")) === "5000");
  const presets = await p.locator("#cQuorumPresets button").count();
  check("(quorum) co cac nut chon nhanh", presets >= 3, String(presets));
  await p.click('#cQuorumPresets button[data-q="66.67"]');
  check("(quorum) bam 2/3 -> an = 6667, nut duoc danh dau", (await p.inputValue("#cQuorum")) === "6667" && (await p.getAttribute('#cQuorumPresets button[data-q="66.67"]', "aria-pressed")) === "true");
  await p.fill("#cQuorumPct", "33.5");
  check("(quorum) go 33,5% -> an = 3350", (await p.inputValue("#cQuorum")) === "3350");
  await p.waitForTimeout(900);
  await p.reload();
  await p.waitForFunction(() => window.__votechain && window.__votechain.S.all, null, { timeout: 20000 });
  await p.evaluate(() => { location.hash = "#/create"; });
  await p.waitForSelector("#cQuorumPct", { state: "visible" });
  check("(quorum) nhap nhap duoc khoi phuc: 33,5% van hien dung", (await p.inputValue("#cQuorumPct")) === "33.5" && (await p.inputValue("#cQuorum")) === "3350", await p.inputValue("#cQuorumPct"));

  // ---------- 3) bố cục trang bỏ phiếu ----------
  await p.evaluate(() => { location.hash = "#/vote"; });
  await p.waitForSelector("#voteColLeft", { state: "attached" });
  const lay = await p.evaluate(() => ({ l: document.getElementById("voteColLeft").children.length, r: document.getElementById("voteColRight").children.length }));
  check("(bo phieu) 2 cot co noi dung", lay.l >= 1 && lay.r >= 1, JSON.stringify(lay));
  check("(js) khong co loi JS (phien 1)", p.errs.length === 0, p.errs.join(" | "));
  await ctx.close();

  // ---------- 4) chưa kết nối ví ----------
  const ctx2 = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx2.route("**/ethers.umd.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: ETHERS_UMD }));
  await ctx2.route(SB + "/**", (r) => r.fulfill({ status: 404, headers: { ...cors, "content-type": "application/json" }, body: "{}" }));
  await ctx2.route("https://ethereum-sepolia-rpc.publicnode.com/**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: route.request().postData() });
    return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: await r.text() });
  });
  const q = await ctx2.newPage(); q.errs = [];
  q.on("pageerror", (e) => q.errs.push(e.message));
  await q.goto("http://127.0.0.1:8099/index.html?contract=" + addr + "&chain=31337#/dashboard");
  await q.waitForFunction(() => window.__votechain && window.__votechain.S.all && window.__votechain.S.all.length === 3, null, { timeout: 25000 });
  const hub0 = await q.evaluate(() => ({ t: document.getElementById("hubTitle").textContent, b: [...document.querySelectorAll("#hubList button")].map((x) => x.textContent) }));
  check("(hub) chua co vi: loi chao + nut 'Ket noi vi MetaMask'", /Chào mừng/.test(hub0.t) && hub0.b.some((x) => /Kết nối ví/.test(x)), JSON.stringify(hub0));
  await q.click("#hubList button");
  await q.waitForSelector("#modal:not(.hidden)", { timeout: 5000 });
  const guide = await q.innerText("#modalContent");
  check("(vi) khong co MetaMask -> hien huong dan cai vi, co link chinh thuc", /Cần ví MetaMask/.test(guide) && (await q.locator('#modalContent a[href^="https://metamask.io"]').count()) === 1, guide.slice(0, 80));
  await q.keyboard.press("Escape");
  check("(vi) Esc dong huong dan, khong loi JS", (await q.evaluate(() => document.getElementById("modal").classList.contains("hidden"))) && q.errs.length === 0, q.errs.join(" | "));
  await ctx2.close();

  await browser.close();
  console.log(log.join("\n"));
  const f = log.filter((l) => l.startsWith("FAIL")).length;
  console.log("\nTONG: " + (log.length - f) + " dat, " + f + " loi");
  process.exit(f ? 1 : 0);
})().catch((e) => { console.log(log.join("\n")); console.error(e); process.exit(1); });
