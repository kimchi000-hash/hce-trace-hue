// Kiểm thử 5 chỉnh sửa giao diện: (10) ảnh bìa cho mọi thẻ, (12) ô chọn cuộc trong thanh "Đang chọn",
// (4) nháp form tạo cuộc, (8) nhớ danh sách cử tri + nút sao chép, (7) cảnh báo đổi tên tổ chức sau khi xác minh.
// Supabase ở đây là giả lập: chỉ trả metadata_history (đúng hash) và ảnh bìa; mọi thứ khác 404.
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

  // ---------- (10) mọi thẻ đều có ảnh bìa ----------
  let { page: p, ctx } = await open(0);
  await p.goto("http://127.0.0.1:8099/index.html?contract=" + addr + "&chain=31337#/elections");
  await p.waitForFunction(() => [...document.querySelectorAll("#view-elections .ecard .cover img")].filter((i) => i.complete && i.naturalWidth > 0).length >= 3, null, { timeout: 15000 }).catch(() => {});
  const covers = await p.evaluate(() => [...document.querySelectorAll("#view-elections .ecard .cover img")].map((i) => ({ src: i.getAttribute("src") || "", ok: i.complete && i.naturalWidth > 0 })));
  check("(10) danh sach Bau cu: 3 the deu co anh bia (khong chi cuoc dang chon)", covers.length === 3 && covers.every((c) => c.ok), JSON.stringify(covers));
  check("(10) moi the dung anh cua cuoc minh (cover-0, cover-1, cover-2)", [0, 1, 2].every((i) => covers.some((c) => c.src.includes("cover-" + i + ".png"))));
  const featured = await p.evaluate(() => document.querySelectorAll("#featuredGrid .ecard .cover img").length);
  check("(10) Dashboard cung hien du anh bia", featured === 3, String(featured));
  const homeImgs = await (async () => { await p.evaluate(() => { location.hash = "#/home"; }); await p.waitForTimeout(500); return p.evaluate(() => document.querySelectorAll("#homeFeaturedGrid .ecard .cover img").length); })();
  check("(10) Trang chu cung hien du anh bia", homeImgs === 3, String(homeImgs));
  const desc = await p.evaluate(() => [...document.querySelectorAll("#homeFeaturedGrid .ecard .desc")].map((d) => d.textContent));
  check("(10) mo ta da xac thuc hash hien tren the", desc.some((t) => /Mô tả cuộc/.test(t)), JSON.stringify(desc));

  // ---------- (12) ô chọn cuộc ----------
  await p.evaluate(() => { location.hash = "#/elections"; });
  await p.waitForTimeout(300);
  await p.click("#view-elections .ecard .btn.primary");
  await p.waitForFunction(() => document.getElementById("view-election") && !document.getElementById("view-election").hidden, null, { timeout: 10000 });
  const pick = await p.evaluate(() => { const s = document.getElementById("ctxPick"); return { n: s.options.length, v: s.value, shown: !!s.offsetParent, dis: s.disabled }; });
  check("(12) thanh 'Dang chon' co o chon cuoc voi 3 lua chon", pick.n === 3 && pick.shown && !pick.dis, JSON.stringify(pick));
  const before = await p.evaluate(() => window.__votechain.S.election.id.toString());
  const other = await p.evaluate(() => [...document.getElementById("ctxPick").options].map((o) => o.value).find((v) => v !== document.getElementById("ctxPick").value));
  await p.selectOption("#ctxPick", other);
  await p.waitForFunction((b) => window.__votechain.S.election && window.__votechain.S.election.id.toString() !== b, before, { timeout: 10000 });
  await p.waitForFunction((o) => document.getElementById("ctxTitle").textContent.includes("#" + o), other, { timeout: 10000 }).catch(() => {});
  const after = await p.evaluate(() => ({ id: window.__votechain.S.election.id.toString(), route: location.hash, title: document.getElementById("ctxTitle").textContent, sel: document.getElementById("ctxPick").value }));
  check("(12) doi cuoc ngay tai trang hien tai (khong ve tab Bau cu)", after.id === other && /#\/election/.test(after.route) && after.sel === other && after.title.includes("#" + other), JSON.stringify(after));
  await p.screenshot({ path: S + "/polish_ctxpick.png" });

  // ---------- (7) cảnh báo đổi tên tổ chức ----------
  await p.evaluate(() => { location.hash = "#/org"; });
  await p.waitForTimeout(500);
  await p.evaluate(() => window.__votechain.pickOrg(1));
  await p.waitForFunction(() => /Tên tổ chức đã đổi sau khi được xác minh/.test(document.getElementById("omAlert").textContent), null, { timeout: 15000 }).catch(() => {});
  const al = await p.textContent("#omAlert");
  check("(7) canh bao ten to chuc da doi sau khi xac minh (tu 'CLB Tin hoc' thanh 'Doan truong...')", /từ “CLB Tin học” thành “Đoàn trường ĐH Kinh tế”/.test(al), al);
  await p.screenshot({ path: S + "/polish_orgwarn.png" });
  check("(10,12,7) khong co loi JS (phien 1)", p.errs.length === 0, p.errs.join(" | "));
  await ctx.close();

  // ---------- (4) nháp form tạo cuộc ----------
  ({ page: p, ctx } = await open(0));
  await p.evaluate(() => { location.hash = "#/create"; });
  await p.waitForSelector("#cNames", { state: "visible" });
  await p.fill("#cTitle", "Bầu liên chi đoàn");
  await p.fill("#cNames", "An\nBình\nCường");
  await p.waitForFunction(() => document.querySelectorAll("#cCandBox details").length === 3, null, { timeout: 5000 });
  await p.evaluate(() => { document.querySelectorAll("#cCandBox details").forEach((d) => (d.open = true)); });
  const bios = p.locator("#cCandBox details").nth(2).locator("textarea").first();
  await bios.fill("Tiểu sử của Cường");
  await p.fill("#cVoters", voters.join("\n"));
  await p.selectOption("#cVisInfo", "internal");
  await p.fill("#cReg", "7");
  await p.waitForTimeout(900);   // chờ lưu nháp (debounce 500 ms)
  const saved = await p.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("votechain:createDraft:v1:")); return k ? JSON.parse(localStorage.getItem(k)) : null; });
  check("(4) nhap duoc luu vao trinh duyet", !!saved && saved.f.cTitle === "Bầu liên chi đoàn" && saved.cand[2] && saved.cand[2].bio === "Tiểu sử của Cường", JSON.stringify(saved && saved.cand));
  // Mở lại trang (giống nhân đôi tab / F5): ứng viên thứ 3 và các trường phải còn
  await p.reload();
  await p.waitForFunction(() => window.__votechain && window.__votechain.S.all, null, { timeout: 25000 });
  await p.evaluate(() => { location.hash = "#/create"; });
  await p.waitForSelector("#cNames", { state: "visible" });
  await p.waitForTimeout(500);
  const rest = await p.evaluate(() => ({
    title: document.getElementById("cTitle").value, names: document.getElementById("cNames").value, voters: document.getElementById("cVoters").value.split("\n").length,
    visInfo: document.getElementById("cVisInfo").value, reg: document.getElementById("cReg").value, cands: document.querySelectorAll("#cCandBox details").length,
    bio3: (document.querySelectorAll("#cCandBox details")[2] || { querySelector: () => null }).querySelector("textarea") ? document.querySelectorAll("#cCandBox details")[2].querySelector("textarea").value : null,
    help: document.getElementById("cVotersHelp").textContent,
  }));
  check("(4) sau khi mo lai: ten, 3 ung vien, danh sach cu tri, pham vi xem, thoi gian deu con", rest.title === "Bầu liên chi đoàn" && rest.names === "An\nBình\nCường" && rest.cands === 3 && rest.voters === 3 && rest.visInfo === "internal" && rest.reg === "7", JSON.stringify(rest));
  check("(4) ho so ung vien thu 3 con nguyen", rest.bio3 === "Tiểu sử của Cường", String(rest.bio3));
  check("(4) goi y so vi hop le duoc cap nhat", /3 ví hợp lệ/.test(rest.help), rest.help);
  await p.screenshot({ path: S + "/polish_draft.png" });
  await p.click("#btnClearDraft");
  await p.waitForTimeout(600);
  const cleared = await p.evaluate(() => ({ title: document.getElementById("cTitle").value, names: document.getElementById("cNames").value, cands: document.querySelectorAll("#cCandBox details").length, ls: Object.keys(localStorage).some((x) => x.startsWith("votechain:createDraft:v1:")) }));
  check("(4) 'Xoa ban nhap' dat lai form ve mac dinh (2 ung vien)", cleared.title === "Bầu Ban cán sự lớp" && cleared.cands === 2 && cleared.names === "Nguyễn Văn A\nTrần Thị B", JSON.stringify(cleared));
  check("(4) khong co loi JS (phien 2)", p.errs.length === 0, p.errs.join(" | "));
  await ctx.close();

  // ---------- (8) nhớ danh sách cử tri ----------
  ({ page: p, ctx } = await open(3));
  const FIRST = await p.evaluate(() => String(window.__votechain.S.all[0].id));
  await p.evaluate(() => { document.getElementById("electionId").value = "1"; });
  await p.evaluate(() => window.__votechain.S.election === null || true);
  await p.evaluate(async () => { location.hash = "#/elections"; });
  await p.waitForTimeout(300);
  await p.click("#view-elections .ecard .btn.primary");   // mở một cuộc bất kỳ để có S.election
  await p.waitForFunction(() => window.__votechain.S.election && location.hash === "#/election", null, { timeout: 10000 });
  // đổi sang cuộc #0 bằng ô chọn rồi sang trang Bỏ phiếu
  await p.selectOption("#ctxPick", FIRST).catch(() => {});
  await p.waitForFunction((FIRST) => window.__votechain.S.election && window.__votechain.S.election.id.toString() === FIRST && location.hash === "#/election", FIRST, { timeout: 10000 });
  await p.evaluate(() => { location.hash = "#/vote"; });
  await p.waitForSelector("#voterListInput", { state: "attached" });
  const st0 = await p.textContent("#proofState");
  check("(8) chua dan danh sach: chua co bang chung", /Chưa có bằng chứng/.test(st0), st0);
  await p.evaluate(() => { document.querySelector("#view-vote details.fold").open = true; });
  await p.fill("#voterListInput", voters.join("\n"));
  await p.waitForTimeout(300);
  const st1 = await p.textContent("#proofState"), d1 = await p.textContent("#proofDetail");
  check("(8) dan danh sach khop root: bang chung hop le", /Bằng chứng hợp lệ/.test(st1) && /bạn dán/.test(d1), st1 + " | " + d1);
  const stored = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("votechain:voters:v1:")).map((k) => JSON.parse(localStorage.getItem(k))));
  check("(8) danh sach duoc nho theo cuoc (3 vi)", stored.length === 1 && stored[0].length === 3, JSON.stringify(stored));
  // mở lại trang: ô trống nhưng vẫn có bằng chứng từ danh sách đã nhớ
  await p.reload();
  await p.waitForFunction(() => window.__votechain && window.__votechain.S.all, null, { timeout: 25000 });
  await p.evaluate(async () => { document.getElementById("electionId").value = "1"; });
  await p.evaluate(() => { location.hash = "#/elections"; });
  await p.waitForTimeout(300);
  await p.selectOption("#ctxPick", FIRST).catch(() => {});
  await p.evaluate(() => document.querySelectorAll("#view-elections .ecard")[2] && true);
  await p.evaluate(async (F) => { const b = [...document.querySelectorAll("#view-elections .ecard")].find((c) => new RegExp("#" + F + "\\b").test(c.querySelector(".idtag").textContent)); b.querySelector(".btn.primary").click(); }, FIRST);
  await p.waitForFunction((FIRST) => window.__votechain.S.election && window.__votechain.S.election.id.toString() === FIRST && location.hash === "#/election", FIRST, { timeout: 10000 });
  await p.evaluate(() => { location.hash = "#/vote"; });
  await p.waitForTimeout(600);
  const empty = await p.inputValue("#voterListInput"), st2 = await p.textContent("#proofState"), d2 = await p.textContent("#proofDetail");
  check("(8) mo lai trang: o danh sach de trong nhung bang chung van hop le (tu danh sach da nho)", empty === "" && /Bằng chứng hợp lệ/.test(st2) && /đã nhớ trên trình duyệt này/.test(d2), st2 + " | " + d2);
  const copyVisible = await p.evaluate(() => !document.getElementById("btnCopyVoters").classList.contains("hidden"));
  check("(8) co nut 'Sao chep danh sach cu tri'", copyVisible);
  await p.click("#btnCopyVoters");
  await p.waitForTimeout(300);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  check("(8) sao chep dung 3 vi vao clipboard", clip.split("\n").length === 3 && voters.every((v) => clip.includes(v)), clip);
  // danh sách sai (không khớp root) không được nhớ
  await p.evaluate(() => { localStorage.clear(); });
  await p.reload();
  await p.waitForFunction(() => window.__votechain && window.__votechain.S.all, null, { timeout: 25000 });
  await p.evaluate(() => { location.hash = "#/elections"; });
  await p.waitForTimeout(300);
  await p.evaluate(async (F) => { const b = [...document.querySelectorAll("#view-elections .ecard")].find((c) => new RegExp("#" + F + "\\b").test(c.querySelector(".idtag").textContent)); b.querySelector(".btn.primary").click(); }, FIRST);
  await p.waitForFunction((FIRST) => window.__votechain.S.election && window.__votechain.S.election.id.toString() === FIRST && location.hash === "#/election", FIRST, { timeout: 10000 });
  await p.evaluate(() => { location.hash = "#/vote"; document.querySelector("#view-vote details.fold").open = true; });
  await p.fill("#voterListInput", voters[0] + "\n" + voters[1]);
  await p.waitForTimeout(300);
  const bad = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("votechain:voters:v1:")).length);
  check("(8) danh sach sai root KHONG duoc nho", bad === 0, String(bad));
  check("(8) khong co loi JS (phien 3)", p.errs.length === 0, p.errs.join(" | "));
  await ctx.close();

  await browser.close();
  console.log(log.join("\n"));
  const f = log.filter((l) => l.startsWith("FAIL")).length;
  console.log("\nTONG: " + (log.length - f) + " dat, " + f + " loi");
  process.exit(f ? 1 : 0);
})().catch((e) => { console.log(log.join("\n")); console.error(e); process.exit(1); });
