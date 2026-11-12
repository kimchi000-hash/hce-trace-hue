// Kiem thu CHIA SE LIEN KET cuoc bau cu (Hardhat cuc bo + Playwright). Cach chay giong phase5_ui.js.
// Supabase khong duoc dung o day (moi yeu cau toi Supabase tra 404): tinh nang chi dung du lieu tren chuoi.
const fs = require("fs");
const ROOT = require("path").resolve(__dirname, "..", "..");
const S = process.env.SHOTDIR || require("os").tmpdir();
const { ethers } = require(ROOT + "/node_modules/ethers");
const { chromium } = require("playwright");
const reg = require(ROOT + "/artifacts/contracts/project/OrganizationRegistry.sol/OrganizationRegistry.json");
const coreArt = require(ROOT + "/artifacts/contracts/project/ProjectCore.sol/ProjectCore.json");
const RPC = "http://127.0.0.1:8545";
const SB = "https://vfzuniykinaivchhuiul.supabase.co";
const ETHERS_UMD = fs.readFileSync(ROOT + "/node_modules/ethers/dist/ethers.umd.min.js", "utf8");
const log = [];
const check = (n, ok, x) => log.push((ok ? "PASS " : "FAIL ") + n + (x ? " :: " + x : ""));

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const accts = (await provider.send("eth_accounts", [])).map(ethers.getAddress);
  const admin = await provider.getSigner(19);
  const registry = await new ethers.ContractFactory(reg.abi, reg.bytecode, admin).deploy(); await registry.waitForDeployment();
  const core = await new ethers.ContractFactory(coreArt.abi, coreArt.bytecode, admin).deploy(await registry.getAddress()); await core.waitForDeployment();
  const addr = await core.getAddress();
  const sg = (i) => provider.getSigner(i);
  const R = registry.connect(await sg(0)), P = registry.connect(admin);
  await (await R.registerOrganization("CLB Tin học", ethers.id("org"))).wait(); await (await P.verifyOrganization(1)).wait();
  for (const i of [1, 2]) { await (await R.addMember(1, accts[i], 1)).wait(); await (await R.addApprover(1, accts[i])).wait(); }
  const create = async (title) => (await core.connect(await sg(0)).createElection({
    organizationId: 1, title, names: ["Nguyễn Văn A", "Trần Thị B"], candidateWallets: [],
    regMinutes: 30, commitMinutes: 10, revealMinutes: 10, quorumBps: 5000, voterCount: 3, merkleRoot: ethers.id("root"),
    metadataHash: ethers.id("m-" + title), candidateMetadataHashes: [ethers.id("a" + title), ethers.id("b" + title)],
  })).wait();
  await create("Bầu BCH đã duyệt");      // #0: se duoc duyet
  await create("Bầu chờ duyệt");         // #1: chua du chu ky
  await create("Bầu bị rút");            // #2: nguoi tao rut
  await (await core.connect(await sg(1)).approveElection(0)).wait();
  await (await core.connect(await sg(2)).approveElection(0)).wait();
  await (await core.connect(await sg(0)).withdrawElection(2)).wait();

  const browser = await chromium.launch();
  async function open(idx, query, hash) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    await ctx.route("**/ethers.umd.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: ETHERS_UMD }));
    await ctx.route(SB + "/**", (r) => r.fulfill({ status: r.request().method() === "OPTIONS" ? 204 : 404, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "content-type": "application/json" }, body: "{}" }));
    await ctx.route("https://ethereum-sepolia-rpc.publicnode.com/**", async (route) => {
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: route.request().postData() });
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: await r.text() });
    });
    await ctx.addInitScript(({ me, rpc }) => {
      const call = async (method, params) => {
        const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }) });
        const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; throw e; } return j.result;
      };
      window.ethereum = { request: async ({ method, params }) => (method === "eth_requestAccounts" || method === "eth_accounts") ? [me] : call(method, params), on() {} };
    }, { me: accts[idx], rpc: RPC });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => log.push("PAGEERROR " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) log.push("CONSOLE.ERR " + m.text().slice(0, 200)); });
    await page.goto(`http://127.0.0.1:8099/index.html${query}${hash || ""}`);
    await page.waitForFunction(() => window.__votechain && window.__votechain.S.account && window.__votechain.S.election, null, { timeout: 25000 });
    return page;
  }
  const base = `?contract=${addr}&chain=31337`;
  const hidden = (p) => p.locator("#btnShare").evaluate((n) => n.classList.contains("hidden"));

  // ===== 1. nut Chia se chi hien khi da duyet =====
  const p0 = await open(5, `${base}&election=0`, "#/election");
  await p0.waitForTimeout(500);
  check("cuoc da du chu ky duyet: co nut Chia se", !(await hidden(p0)));
  const p1 = await open(5, `${base}&election=1`, "#/election");
  await p1.waitForTimeout(500);
  check("cuoc cho duyet (chua du chu ky): KHONG co nut Chia se", await hidden(p1));
  const p2 = await open(5, `${base}&election=2`, "#/election");
  await p2.waitForTimeout(500);
  check("cuoc bi nguoi tao rut: KHONG co nut Chia se", await hidden(p2));

  // ===== 2. hop thoai chia se =====
  await p0.click("#btnShare");
  await p0.waitForSelector("#modal:not(.hidden) .share-link");
  const link = await p0.inputValue("#modal .share-link");
  const u = new URL(link);
  check("lien ket dung dich: ?election=0, #/election, hop dong va chain (khac mac dinh)", u.searchParams.get("election") === "0" && u.hash === "#/election" && u.searchParams.get("contract") === addr && u.searchParams.get("chain") === "31337", link);
  check("lien ket KHONG mang quyen: khong co token, vi, chu ky", !/token|access|signature|0x[0-9a-fA-F]{40}(?!$)/.test(link.replace(addr, "")) && ![...u.searchParams.keys()].some((k) => !["election", "contract", "chain"].includes(k)));
  await p0.waitForFunction(() => /CLB Tin học/.test(document.getElementById("modal").textContent), null, { timeout: 8000 }).catch(() => {});   // tên tổ chức nạp bất đồng bộ
  const mt = await p0.textContent("#modal");
  check("xem truoc trong hop thoai: ten cuoc, ten to chuc (doc tu chuoi), gio", /Bầu BCH đã duyệt/.test(mt) && /CLB Tin học/.test(mt) && /Nộp phiếu từ/.test(mt), mt.replace(/\s+/g, " ").slice(0, 200));
  check("co Facebook, Email; ghi ro lien ket khong cap quyen; canh bao may cuc bo", (await p0.locator("#modal a[href^='https://www.facebook.com/sharer/sharer.php?u=']").count()) === 1 && (await p0.locator("#modal a[href^='mailto:']").count()) === 1 && /không cấp quyền xem nội dung hạn chế và không cho bỏ phiếu/.test(mt) && /máy cục bộ/.test(mt));
  const fbHref = await p0.getAttribute("#modal a[href*='facebook']", "href");
  check("lien ket Facebook ma hoa dung lien ket", new URL(fbHref).searchParams.get("u") === link);
  await p0.click("#modal .btn.primary");
  await p0.waitForTimeout(300);
  check("nut Sao chep dua dung lien ket vao clipboard", (await p0.evaluate(() => navigator.clipboard.readText())) === link);
  await p0.screenshot({ path: S + "/share_modal.png" });

  // ===== 3. mo lien ket tren may khac: vao thang trang chi tiet cuoc dung, khong can #/ =====
  const q = new URL(link); q.hash = "";
  const pn = await open(6, q.search, "");
  await pn.waitForFunction(() => window.__votechain.S.route === "election" && /Bầu BCH đã duyệt/.test(document.querySelector("#elTitle").textContent), null, { timeout: 15000 });
  check("mo lien ket (khong co hash): vao thang trang chi tiet cuoc #0", true);
  check("nguoi nhan (vi la, khong co quyen): van thay du lieu cong khai nhung KHONG tu dong thanh cu tri", (await pn.evaluate(() => window.__votechain.S.election.committed)) === false && (await pn.locator("#btnCommit").isDisabled()));
  // ===== 4. lien ket day du (co hash) cung hoat dong =====
  const pf = await open(6, new URL(link).search, "#/election");
  check("lien ket co #/election: dung cuoc", /Bầu BCH đã duyệt/.test(await pf.textContent("#elTitle")));

  await browser.close();
  console.log(log.join("\n"));
  const bad = log.filter((l) => /^(FAIL|PAGEERROR|CONSOLE\.ERR)/.test(l));
  console.log("\n" + (log.length - bad.length) + " dat / " + bad.length + " loi");
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.log(log.join("\n")); console.error("E2E CRASH", e); process.exit(2); });
