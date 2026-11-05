// Kiem thu BIEU DO thong ke (ket qua + vong tham gia) tren Hardhat cuc bo + Playwright. Cach chay giong card_ui.js.
const fs = require("fs");
const ROOT = require("path").resolve(__dirname, "..", "..");
const SHOT = process.env.SHOTDIR || require("os").tmpdir();
const { ethers } = require(ROOT + "/node_modules/ethers");
const { chromium } = require("playwright");
const art = (n) => require(ROOT + "/artifacts/contracts/project/" + n + ".sol/" + n + ".json");
const { buildTree } = require(ROOT + "/scripts/merkle");
const RPC = "http://127.0.0.1:8545";
const SB = "https://vfzuniykinaivchhuiul.supabase.co";
const CID = "bafybeickdjosojmlagojcg7l4krhoffitywd74jn7rvzcqodzjti6qmony";
const ETHERS_UMD = fs.readFileSync(ROOT + "/node_modules/ethers/dist/ethers.umd.min.js", "utf8");
const log = [];
const check = (n, ok, x) => log.push((ok ? "PASS " : "FAIL ") + n + (x ? " :: " + x : ""));

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const accts = (await provider.send("eth_accounts", [])).map(ethers.getAddress);
  const sg = (i) => provider.getSigner(i);
  const deploy = async (name, signer, ...args) => { const a = art(name); const c = await new ethers.ContractFactory(a.abi, a.bytecode, signer).deploy(...args); await c.waitForDeployment(); return c; };
  const registry = await deploy("OrganizationRegistry", await sg(19));
  const core = await deploy("ProjectCore", await sg(0), await registry.getAddress());
  const core2 = await deploy("ProjectCore", await sg(0), await registry.getAddress());
  const R = registry.connect(await sg(0)); const P = registry.connect(await sg(19));
  await (await R.registerOrganization("CLB Blockchain K58", ethers.id("org"))).wait();
  await (await P.verifyOrganization(1)).wait();
  for (const i of [1, 2]) { await (await R.addMember(1, accts[i], 1)).wait(); await (await R.addApprover(1, accts[i])).wait(); }
  const voters = [3, 4, 5].map((i) => accts[i]);
  const tree = buildTree(voters);
  await (await core.connect(await sg(0)).createElection({
    organizationId: 1, title: 'Bầu Chủ nhiệm "CLB" <K58>', names: ["Nguyễn Văn A", "Trần Thị B"], candidateWallets: [],
    regMinutes: 5, commitMinutes: 10, revealMinutes: 10, quorumBps: 5000, voterCount: tree.voterCount, merkleRoot: tree.root,
    metadataHash: ethers.id("e"), candidateMetadataHashes: [ethers.id("c0"), ethers.id("c1")],
  })).wait();
  for (const i of [1, 2]) await (await core.connect(await sg(i)).approveElection(0)).wait();
  const jump = async (key) => { const s = await core.getElectionStats(0); const t = Number(s[key]) + 1; await provider.send("evm_setNextBlockTimestamp", [t]); await provider.send("evm_mine", []); };
  const commitH = (v, c, salt) => ethers.solidityPackedKeccak256(["uint256", "uint256", "string", "address"], [0, c, salt, v]);
  await jump("regEnd");
  for (const i of [3, 4, 5]) await (await core.connect(await sg(i)).commit(0, commitH(accts[i], 0, "s" + i), tree.proofs[accts[i]])).wait();
  await jump("commitEnd");
  for (const i of [3, 5]) await (await core.connect(await sg(i)).reveal(0, 0, "s" + i)).wait();   // vi 4 KHONG reveal

  const sbt = await deploy("VoterCardSBT", await sg(0), await core.getAddress(), `ipfs://${CID}/`, 8, "png");
  const sbtEmoji = await deploy("VoterCardSBT", await sg(0), await core.getAddress(), "", 0, "");
  const sbtOther = await deploy("VoterCardSBT", await sg(0), await core2.getAddress(), "", 0, "");
  const coreAddr = await core.getAddress();
  // doc ten loi tuy bien cua hop dong tu du lieu revert (estimateGas khong luon tu giai ma)
  const errName = (e) => { try { return sbt.interface.parseError(e.data).name; } catch (_) { return e.revert ? e.revert.name : e.message; } };

  const browser = await chromium.launch();
  async function open(idx, sbtAddr, route, vp) {
    const ctx = await browser.newContext({ viewport: vp || { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
    await ctx.route("**/ethers.umd.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: ETHERS_UMD }));
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    await ctx.route(SB + "/**", (r) => r.request().method() === "OPTIONS" ? r.fulfill({ status: 204, headers: cors }) : r.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: "[]" }));
    await ctx.route("https://ethereum-sepolia-rpc.publicnode.com/**", async (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: route.request().postData() });
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: await r.text() });
    });
    // chan moi cong IPFS cong khai de chung minh anh du phong cuc bo (web/mascots) hoat dong ngoai mang
    await ctx.route(/\/ipfs\//, (r) => r.abort());
    await ctx.addInitScript(({ me, rpc }) => {
      const call = async (method, params) => {
        // gia lap gioi han cua RPC MetaMask/Infura: eth_getLogs toi da 10.000 block moi lan
        if (method === "eth_getLogs" && params && params[0]) {
          const f = params[0]; const span = (f.toBlock === "latest" ? Infinity : parseInt(f.toBlock, 16)) - parseInt(f.fromBlock, 16);
          if (span >= 10000) { const e = new Error("range " + (span + 1) + " exceeds limit of 10000"); e.code = -32602; throw e; }
        }
        const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }) });
        const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; } return j.result;
      };
      window.ethereum = { request: async ({ method, params }) => (method === "eth_requestAccounts" || method === "eth_accounts") ? [me] : call(method, params), on() {} };
    }, { me: accts[idx], rpc: RPC });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => log.push("PAGEERROR " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|ERR_FAILED|net::/.test(m.text())) log.push("CONSOLE.ERR " + m.text().slice(0, 200)); });
    await page.goto(`http://127.0.0.1:8099/index.html?contract=${coreAddr}&chain=31337&election=0${sbtAddr ? "&sbt=" + sbtAddr : ""}#/${route}`);
    await page.waitForFunction(() => window.__votechain && window.__votechain.S.account && window.__votechain.S.election, null, { timeout: 25000 });
    return page;
  }
  const idle = (p) => p.waitForFunction(() => window.__votechain.S.busy === false, null, { timeout: 40000 });
  const shot = (p, n) => p.screenshot({ path: SHOT + "/card_" + n + ".png", fullPage: true });

  // ===== bieu do o trang chi tiet cuoc bau cu (pha mo phieu: 2 phieu cho ung vien 0) =====
  const pd = await open(3, await sbt.getAddress(), "election");
  await pd.waitForSelector("#vizResults .viz-row", { timeout: 15000 });
  const rows = await pd.locator("#vizResults .viz-row").count();
  check("bieu do ket qua: 2 hang ung vien", rows === 2, String(rows));
  const txt = await pd.textContent("#vizResults");
  check("ung vien 0 co 2 phieu (100%), ung vien 1 co 0 phieu", /Nguyễn Văn A2 phiếu · 100,0%/.test(txt) && /Trần Thị B0 phiếu · 0,0%/.test(txt), txt);
  await pd.waitForTimeout(1100);
  const w = await pd.locator("#vizResults .viz-fill").evaluateAll((n) => n.map((x) => Math.round(parseFloat(x.style.width))));
  check("do dai thanh dung ti le (100 va 0)", w[0] === 100 && w[1] === 0, JSON.stringify(w));
  check("nguoi dan dau duoc to mau rieng", (await pd.locator("#vizResults .viz-fill.lead").count()) === 1);
  const leg = await pd.textContent("#vizPart .viz-legend");
  check("vong tham gia: du dieu kien 3, commit 3, mo phieu 2, quorum 50,00%", /Đủ điều kiện3/.test(leg) && /Đã commit3/.test(leg) && /Đã mở phiếu2/.test(leg) && /50,00%/.test(leg), leg);
  const rt = await pd.textContent("#vizPart"); check("vong tham gia: 66,66% (cat nhu cac so khac) va da dat quorum", /66,66%/.test(rt) && /Đã đạt quorum/.test(rt), rt);
  const da = await pd.locator("#vizPart .viz-ring .r").getAttribute("stroke-dasharray");
  const frac = parseFloat(da) / parseFloat(da.split(" ")[1]);
  check("cung mo phieu bang 2/3 vong", Math.abs(frac - 2 / 3) < 0.01, da);
  await pd.locator("#vizResults").scrollIntoViewIfNeeded();
  await shot(pd, "viz_desktop");
  const pm = await open(3, await sbt.getAddress(), "election", { width: 390, height: 844 });
  await pm.waitForSelector("#vizResults .viz-row", { timeout: 15000 });
  await pm.waitForTimeout(1100);
  check("di dong 390px: khong tran ngang", await pm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot(pm, "viz_mobile");
  await browser.close();
  console.log(log.join("\n"));
  const bad = log.filter((l) => /^(FAIL|PAGEERROR|CONSOLE\.ERR)/.test(l));
  console.log("\n" + (log.length - bad.length) + " dat / " + bad.length + " loi");
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.log(log.join("\n")); console.error("E2E CRASH", e); process.exit(2); });
