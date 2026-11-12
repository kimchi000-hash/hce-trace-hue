// Kiểm thử: mở trang không có ?election -> tự chọn cuộc đang diễn ra; có ?election -> giữ đúng cuộc được chỉ định.
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
  const contents = [];
  const mk = (title, commit) => core.connect(sg0).createElection({
    organizationId: 1, title, names: ["Nguyễn Văn A", "Trần Thị B"], candidateWallets: [],
    regMinutes: 1, commitMinutes: commit, revealMinutes: commit, quorumBps: 5000, voterCount: tree.voterCount, merkleRoot: tree.root,
    metadataHash: ethers.id("m" + title), candidateMetadataHashes: [ethers.id("a" + title), ethers.id("b" + title)],
  });
  const sg0 = await sg(0);
  await (await mk("Cuộc đã kết thúc", 1)).wait();
  for (const j of [1, 2]) await (await core.connect(await sg(j)).approveElection(0)).wait();
  await (await mk("Cuộc đang nộp phiếu", 60)).wait();
  for (const j of [1, 2]) await (await core.connect(await sg(j)).approveElection(1)).wait();
  await provider.send("evm_increaseTime", [200]); await provider.send("evm_mine", []);

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
    await page.waitForFunction(() => window.__votechain && window.__votechain.S.all && window.__votechain.S.all.length === 2, null, { timeout: 25000 });
    return { page, ctx };
  }
  // mở không kèm ?election: cuộc mặc định (#0) đã kết thúc nên phải tự chuyển sang #1 đang nộp phiếu
  let { page: p, ctx } = await open(1);
  await p.waitForFunction(() => window.__votechain.S.election && window.__votechain.S.election.id === 1n, null, { timeout: 20000 }).catch(() => {});
  const id1 = await p.evaluate(() => String(window.__votechain.S.election && window.__votechain.S.election.id));
  check("khong co ?election: tu chon cuoc dang dien ra (#1), khong dung o cuoc da ket thuc (#0)", id1 === "1", id1);
  check("o ID trong Cai dat cung doi theo (1)", (await p.inputValue("#electionId")) === "1");
  check("khong loi JS (1)", p.errs.length === 0, p.errs.join(" | "));
  await ctx.close();
  // có ?election=0: giữ đúng cuộc người gửi chỉ định
  const o2 = await open(1, "&election=0");
  await o2.page.waitForTimeout(2500);
  const id0 = await o2.page.evaluate(() => String(window.__votechain.S.election && window.__votechain.S.election.id));
  check("co ?election=0: giu dung cuoc #0 duoc chi dinh", id0 === "0", id0);
  await o2.ctx.close();

  await browser.close();
  console.log(log.join("\n"));
  const f = log.filter((l) => l.startsWith("FAIL")).length;
  console.log("\nTONG: " + (log.length - f) + " dat, " + f + " loi");
  process.exit(f ? 1 : 0);
})().catch((e) => { console.log(log.join("\n")); console.error(e); process.exit(1); });
