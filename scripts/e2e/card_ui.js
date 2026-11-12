// Kiem thu giao dien THE CU TRI (Soulbound NFT) tren Hardhat cuc bo + Playwright.
// Cach chay (3 cua so): (1) npx hardhat node  (2) python3 -m http.server 8099 --directory web  (3) node scripts/e2e/card_ui.js
// Supabase duoc tra rong (khong lien quan den the). Day la kiem thu giao dien tren chuoi cuc bo, KHONG phai Sepolia/MetaMask that.
const fs = require("fs");
const ROOT = require("path").resolve(__dirname, "..", "..");
const SHOT = process.env.SHOTDIR || require("os").tmpdir();
const { ethers } = require(ROOT + "/node_modules/ethers");
const { chromium } = require("playwright");
const art = (n) => require(ROOT + "/artifacts/contracts/project/" + n + ".sol/" + n + ".json");
const { buildTree } = require(ROOT + "/scripts/merkle");
const RPC = "http://127.0.0.1:8545";
const SB = "https://vfzuniykinaivchhuiul.supabase.co";
const CID = "bafybeico4cogxnkerkmjkeisv4yjauxa35huufj5qv5y6drdlgtawjfrgq";
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

  // ===== 1. vi 3 (da reveal) nhan the qua giao dien, hop dong ngoai (IPFS) =====
  const p3 = await open(3, await sbt.getAddress(), "card");
  await p3.waitForFunction(() => window.__votechain.S.sbtInfo, null, { timeout: 15000 });
  check("hop dong the hop le: hien 8 mascot + anh IPFS", /8 mascot/.test(await p3.textContent("#sbtStatus")) && /IPFS/.test(await p3.textContent("#sbtStatus")), await p3.textContent("#sbtStatus"));
  await p3.waitForSelector("#cardAvatars .vc-pick", { timeout: 15000 });
  check("hien du 8 lua chon mascot", (await p3.locator("#cardAvatars .vc-pick").count()) === 8);
  check("nguon anh: thu thu muc cuc bo truoc, roi cong IPFS", await p3.evaluate(() => { const s = window.__votechain.mascotSources(6); return s[0] === "mascots/6.png" && /^https:\/\/ipfs\.io\/ipfs\/bafy[^/]+\/6\.png$/.test(s[1]) && s.length === 4; }));
  await p3.waitForFunction(() => [...document.querySelectorAll("#cardAvatars img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 10000 });
  check("8 anh mascot da tai duoc (cong IPFS bi chan -> dung anh cuc bo)", true);
  check("nut nhan the bi khoa khi chua dong y", await p3.locator("#btnMintCard").isDisabled());
  await p3.locator("#cardAvatars .vc-pick").nth(6).click();
  check("chon mascot #6 (Rong khien)", (await p3.locator("#cardAvatars .vc-pick").nth(6).getAttribute("aria-checked")) === "true");
  check("thong bao quyen rieng tu hien ro (cong khai vi, khong chuyen nhuong, su kien Reveal)", /địa chỉ ví/.test(await p3.textContent(".vc-consent")) && /không thể chuyển nhượng/.test(await p3.textContent(".vc-consent")) && /Reveal/.test(await p3.textContent(".vc-consent")));
  await p3.waitForTimeout(400);
  check("xem truoc the: co ten cuoc bau, so thu tu #0001", /#0001/.test(await p3.textContent("#cardPreview")) && (await p3.textContent("#cardPreview")).includes("Bầu Chủ nhiệm"));
  await shot(p3, "01_mint_ready");
  await p3.check("#cardConsent");
  check("tich dong y -> nut nhan the mo khoa", await p3.locator("#btnMintCard").isEnabled());
  await p3.click("#btnMintCard"); await p3.waitForTimeout(300); await idle(p3);
  await p3.waitForFunction(() => /đã nhận thẻ/i.test(document.querySelector("#cardStatus").textContent), null, { timeout: 20000 });
  check("tren chuoi: vi 3 co the, mascot 6, serial 1", await sbt.hasCard(0, accts[3]) && Number((await sbt.cardOf(await sbt.tokenIdOf(0, accts[3]))).avatarId) === 6 && Number((await sbt.cardOf(await sbt.tokenIdOf(0, accts[3]))).serial) === 1);
  await p3.waitForFunction(() => document.querySelectorAll("#cardCollection .vcard").length === 1, null, { timeout: 15000 });
  check("bo suu tap hien dung 1 the, dung ten cuoc bau (da thoat ky tu dac biet)", (await p3.textContent("#cardCollection")).includes('Bầu Chủ nhiệm "CLB" <K58>'));
  check("the hien so thu tu, ngay cap, NFT ID", /#0001/.test(await p3.textContent("#cardCollection")) && /NFT ID/.test(await p3.textContent("#cardCollection")));
  // ----- tai / chia se anh the -----
  const [dlEv] = await Promise.all([p3.waitForEvent("download", { timeout: 15000 }), p3.locator("#cardCollection .vcard").getByText("Tải ảnh thẻ").click()]);
  const dlPath = SHOT + "/votechain_card_test.png"; await dlEv.saveAs(dlPath);
  const png = fs.readFileSync(dlPath);
  check("tai anh the: tep PNG hop le, 1080x1350, ten co so thu tu", png.slice(0, 8).toString("hex") === "89504e470d0a1a0a" && png.readUInt32BE(16) === 1080 && png.readUInt32BE(20) === 1350 && /the-cu-tri-0001-cuoc-0\.png$/.test(dlEv.suggestedFilename()), dlEv.suggestedFilename());
  const ink = await p3.evaluate(async (b64) => {
    const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
    const c = document.createElement("canvas"); c.width = 1080; c.height = 1350; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    const d = g.getImageData(390, 380, 300, 300).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (!(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245)) n++;
    return n / (d.length / 4);
  }, png.toString("base64"));
  check("anh the co ve mascot that (khong phai o trong)", ink > 0.25, String(ink));
  await p3.evaluate(() => { navigator.canShare = () => true; navigator.share = async (o) => { window.__shared = o.files[0].name + "|" + o.files[0].type + "|" + o.text; }; });
  await p3.locator("#cardCollection .vcard").getByText("Chia sẻ").click();
  await p3.waitForFunction(() => window.__shared, null, { timeout: 15000 });
  const shared = await p3.evaluate(() => window.__shared);
  check("chia se: dung bang chia se he thong, kem anh PNG va noi dung; khong lo dia chi vi", /^votechain-the-cu-tri-0001-cuoc-0\.png\|image\/png\|Mình vừa nhận Thẻ cử tri VoteChain/.test(shared) && !shared.toLowerCase().includes(accts[3].toLowerCase()), shared);
  check("localhost: khong hien nut chep lien ket (chi hien khi trang chay https cong khai)", (await p3.locator("#cardCollection .vcard").getByText("Chép liên kết").count()) === 0);
  await shot(p3, "02b_actions");
  check("khong con khung nhan the (da co the)", await p3.locator("#cardMintBox").evaluate((n) => n.classList.contains("hidden")));
  const uri = await sbt.tokenURI(await sbt.tokenIdOf(0, accts[3]));
  const json = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
  check("tokenURI tren chuoi: anh = ipfs://CID/6.png, KHONG chua lua chon/salt", json.image === `ipfs://${CID}/6.png` && !/s3|Candidate|Choice/.test(JSON.stringify(json)), json.image);
  await shot(p3, "02_after_mint");
  // chong nhan lai: gan the thanh cong, goi truc tiep hop dong
  let dbl = ""; try { await sbt.connect(await sg(3)).mint(0, 1); } catch (e) { dbl = errName(e); }
  check("hop dong chan nhan lan hai (AlreadyMinted)", dbl === "AlreadyMinted", dbl);
  // chong chuyen nhuong
  let tr = ""; try { await sbt.connect(await sg(3)).transferFrom(accts[3], accts[7], await sbt.tokenIdOf(0, accts[3])); } catch (e) { tr = errName(e); }
  check("hop dong chan chuyen nhuong (Soulbound)", tr === "Soulbound", tr);

  // ===== 2. tai lai: da co the -> loi moi o man Bo phieu bi an =====
  await p3.goto(`http://127.0.0.1:8099/index.html?contract=${coreAddr}&chain=31337&election=0&sbt=${await sbt.getAddress()}#/vote`);
  await p3.waitForFunction(() => window.__votechain.S.account && window.__votechain.S.election, null, { timeout: 20000 });
  await p3.waitForTimeout(1200);
  check("vi da nhan the: loi moi o man Bo phieu da an", await p3.locator("#cardInvite").evaluate((n) => n.classList.contains("hidden")));

  // ===== 3. vi 5 (da reveal, chua nhan): loi moi hien o man Bo phieu =====
  const p5 = await open(5, await sbt.getAddress(), "vote");
  await p5.waitForFunction(() => !document.querySelector("#cardInvite").classList.contains("hidden"), null, { timeout: 15000 });
  check("vi da reveal nhung chua nhan the: hien loi moi nhan the", /Nhận thẻ/.test(await p5.textContent("#cardInvite")));
  await shot(p5, "03_invite");
  await p5.click("#cardInvite button");
  await p5.waitForSelector("#cardAvatars .vc-pick", { timeout: 15000 });
  check("bam 'Nhan the' -> sang man The cu tri", (await p5.evaluate(() => location.hash)) === "#/card");

  // ===== 4. vi 4 (commit nhung KHONG reveal): khong nhan duoc the =====
  const p4 = await open(4, await sbt.getAddress(), "card");
  await p4.waitForFunction(() => /mở phiếu thành công/.test(document.querySelector("#cardStatus").textContent), null, { timeout: 15000 });
  check("vi chua reveal: giao dien bao can mo phieu, khung nhan the bi an", await p4.locator("#cardMintBox").evaluate((n) => n.classList.contains("hidden")));
  let nr = ""; try { await sbt.connect(await sg(4)).mint(0, 0); } catch (e) { nr = errName(e); }
  check("hop dong tu choi vi chua reveal du goi truc tiep (NotRevealed)", nr === "NotRevealed", nr);
  let out = ""; try { await sbt.connect(await sg(9)).mint(0, 0); } catch (e) { out = errName(e); }
  check("vi ngoai danh sach khong nhan duoc the (NotRevealed)", out === "NotRevealed", out);
  await shot(p4, "04_not_revealed");

  // ===== 5. che do emoji du phong =====
  const pe = await open(5, await sbtEmoji.getAddress(), "card");
  await pe.waitForSelector("#cardAvatars .vc-pick", { timeout: 15000 });
  check("hop dong emoji: hien 6 lua chon bang emoji (khong dung anh)", (await pe.locator("#cardAvatars .vc-pick").count()) === 6 && (await pe.locator("#cardAvatars img").count()) === 0 && (await pe.locator("#cardAvatars .vc-emoji").count()) === 6);
  await shot(pe, "05_emoji_mode");

  // ===== 6. hop dong the tro sai ProjectCore bi tu choi =====
  const po = await open(5, await sbtOther.getAddress(), "card");
  await po.waitForFunction(() => /ProjectCore khác/.test(document.querySelector("#sbtStatus").textContent), null, { timeout: 15000 });
  check("hop dong the tro ProjectCore khac bi tu choi (khong cho nhan nham)", (await po.evaluate(() => window.__votechain.S.sbtAddr)) === "");

  // ===== 7. chua cau hinh the =====
  const pn = await open(5, "", "card");
  await pn.waitForFunction(() => /Chưa có hợp đồng thẻ/.test(document.querySelector("#cardStatus").textContent), null, { timeout: 15000 });
  check("chua cau hinh the: thong bao ro, khong loi", true);

  // ===== 8. dien thoai (390px): khong tran ngang, the + khung nhan the van doc duoc =====
  const pm = await open(5, await sbt.getAddress(), "card", { width: 390, height: 844 });
  await pm.waitForSelector("#cardAvatars .vc-pick", { timeout: 15000 });
  await pm.waitForTimeout(800);
  check("man hinh 390px: khong tran ngang trang", await pm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await pm.evaluate(() => document.documentElement.scrollWidth + " vs " + window.innerWidth));
  await shot(pm, "06_mobile");

  // ===== 9. Nhat ky su kien voi RPC gioi han 10.000 block (khoang quet mac dinh 20.000 phai duoc chia nho) =====
  await provider.send("hardhat_mine", ["0x2af8"]);   // +11000 block: khoang quet mac dinh (20.000) nay vuot han muc 10.000 cua RPC gia lap
  const pl = await open(5, await sbt.getAddress(), "vote");
  await pl.click('.nav-item[data-route="log"]');   // nguoi dung bam muc "Nhat ky hoat dong"
  await pl.waitForFunction(() => /sự kiện trong block/.test(document.querySelector("#logInfo").textContent), null, { timeout: 20000 });
  check("nhat ky: quet 20.000 block qua RPC gioi han 10.000 van thanh cong (chia nho)", true, await pl.textContent("#logInfo"));
  check("nhat ky co su kien tao/duyet/commit/reveal (quet tu block 0, qua nhieu lan goi)", (await pl.locator("#logRows tr:not(.empty)").count()) > 0, await pl.textContent("#logInfo"));

  await browser.close();
  console.log(log.join("\n"));
  const bad = log.filter((l) => /^(FAIL|PAGEERROR|CONSOLE\.ERR)/.test(l));
  console.log("\n" + (log.length - bad.length) + " dat / " + bad.length + " loi");
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.log(log.join("\n")); console.error("E2E CRASH", e); process.exit(2); });
