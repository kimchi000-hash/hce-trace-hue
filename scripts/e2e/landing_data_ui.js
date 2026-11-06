// Trang chủ: section "số liệu + cuộc bầu cử nổi bật" đọc dữ liệu thật từ hợp đồng (Hardhat cục bộ), thứ tự section, chân trang.
const fs = require("fs");
const ROOT = require("path").resolve(__dirname, "..", "..");
const S = process.env.SHOTDIR || require("os").tmpdir();
const { ethers } = require(ROOT + "/node_modules/ethers");
const { chromium } = require("playwright");
const reg = require(ROOT + "/artifacts/contracts/project/OrganizationRegistry.sol/OrganizationRegistry.json");
const coreArt = require(ROOT + "/artifacts/contracts/project/ProjectCore.sol/ProjectCore.json");
const RPC = "http://127.0.0.1:8545";
const ETHERS_UMD = fs.readFileSync(ROOT + "/node_modules/ethers/dist/ethers.umd.min.js", "utf8");
let ok = 0, bad = 0;
const check = (n, c, d) => { if (c) { ok++; console.log("PASS", n); } else { bad++; console.log("FAIL", n, d === undefined ? "" : "::", d); } };

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
  for (const t of ["Bầu BCH A", "Bầu BCH B", "Bầu BCH C"]) await create(t);
  for (const id of [0, 1]) for (const i of [1, 2]) await (await core.connect(await sg(i)).approveElection(id)).wait();   // duyệt bớt để không chạm giới hạn cuộc chờ duyệt
  await create("Bầu BCH D");

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route("**/ethers.umd.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: ETHERS_UMD }));
  await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: r.request().method() === "OPTIONS" ? 204 : 404, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "content-type": "application/json" }, body: "{}" }));
  await ctx.route("https://ethereum-sepolia-rpc.publicnode.com/**", async (route) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: route.request().postData() });
    return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: await r.text() });
  });
  const errs = [];
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`http://127.0.0.1:8099/index.html?contract=${addr}&chain=31337`);
  await p.waitForFunction(() => document.querySelectorAll("#homeFeaturedGrid .ecard").length > 0, null, { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(500);

  check("trang chu (khong vi): dang o landing", await p.evaluate(() => document.body.classList.contains("landing")));
  check("section 2 (so lieu + noi bat) nam TRUOC section 3 (Cach hoat dong)", await p.evaluate(() => { const a = document.getElementById("homeLive"), b = document.getElementById("homeSteps"); return !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)); }));
  check("so lieu: tong so cuoc = 4", (await p.textContent("#hKpiTotal")).trim() === "4", await p.textContent("#hKpiTotal"));
  check("so lieu: tong cu tri = 12 (4 cuoc x 3)", (await p.textContent("#hKpiVoters")).trim() === "12", await p.textContent("#hKpiVoters"));
  check("so lieu trang chu khop Dashboard", await p.evaluate(() => ["Total", "Active", "Voters", "Votes"].every((k) => document.getElementById("hKpi" + k).textContent === document.getElementById("kpi" + k).textContent)));
  const n = await p.locator("#homeFeaturedGrid .ecard").count();
  check("cuoc bau cu noi bat: toi da 3 the tren trang chu", n === 3, String(n));
  check("the co nut Xem chi tiet", (await p.locator("#homeFeaturedGrid .ecard .btn.primary").count()) === 3);
  const dn = await p.locator("#featuredGrid .ecard").count();
  check("Dashboard van hien 4 the (toi da 6)", dn === 4, String(dn));
  const bg = await p.evaluate(() => { const f = getComputedStyle(document.querySelector(".app-foot")).backgroundColor, b = getComputedStyle(document.querySelector("#homeSteps")).backgroundColor; return { f, b, w: document.querySelector(".app-foot").getBoundingClientRect().width, vw: innerWidth }; });
  check("chan trang landing: nen toi, khac nen section tren", bg.f === "rgb(15, 36, 71)" && bg.f !== bg.b, JSON.stringify(bg));
  check("chan trang landing: tran toan chieu ngang", Math.abs(bg.w - bg.vw) <= 20, JSON.stringify(bg));

  await p.click("#homeFeaturedGrid .ecard .btn.primary");
  await p.waitForTimeout(500);
  check("bam Xem chi tiet o trang chu -> vao trang cuoc bau cu (co thanh ben)", /#\/election/.test(await p.evaluate(() => location.hash)) && (await p.locator("#sidebar").isVisible()));

  await p.evaluate(() => { location.hash = "#/home"; });
  await p.waitForTimeout(400);
  await p.screenshot({ path: S + "/landing_04_live.png", fullPage: true });
  check("khong co loi JS", errs.length === 0, errs.join(" | "));
  await browser.close();
  console.log(`\n${ok} dat / ${bad} loi`);
  process.exit(bad ? 1 : 0);
})();
