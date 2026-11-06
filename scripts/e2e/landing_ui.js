// Trang chủ (landing): chưa có thanh bên; bấm mục nào đó mới vào ứng dụng có thanh bên.
const fs = require("fs");
const ROOT = require("path").resolve(__dirname, "..", "..");
const { chromium } = require("playwright");
const ETHERS_UMD = fs.readFileSync(ROOT + "/node_modules/ethers/dist/ethers.umd.min.js", "utf8");
const S = process.env.SHOTDIR || require("os").tmpdir();
const URL = "http://127.0.0.1:8099/index.html";
let ok = 0, bad = 0;
const check = (n, c, d) => { if (c) { ok++; console.log("PASS", n); } else { bad++; console.log("FAIL", n, d === undefined ? "" : "::", d === undefined ? "" : d); } };
const vis = (p, sel) => p.locator(sel).first().isVisible();

(async () => {
  const browser = await chromium.launch();
  const log = [];
  const mk = async (opts, wallet) => {
    const ctx = await browser.newContext(opts);
    await ctx.route("**/ethers.umd.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: ETHERS_UMD }));
    await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: r.request().method() === "OPTIONS" ? 204 : 404, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "content-type": "application/json" }, body: "{}" }));
    if (wallet) await ctx.addInitScript(() => {
      const call = async (method, params) => { const r = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }) }); const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; throw e; } return j.result; };
      window.ethereum = { request: async ({ method, params }) => (method === "eth_requestAccounts" || method === "eth_accounts") ? ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"] : call(method, params), on() {} };
    });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => log.push("PAGEERROR " + e.message));
    return p;
  };

  // 1) vào không có #/route, không có ?election -> trang chủ
  let p = await mk({ viewport: { width: 1920, height: 1080 } });
  await p.goto(URL);
  await p.waitForTimeout(600);
  check("mo trang khong hash: la trang chu (body.landing)", await p.evaluate(() => document.body.classList.contains("landing")));
  check("trang chu: KHONG co thanh ben", !(await vis(p, "#sidebar")));
  check("trang chu: co thanh tren (Khám phá, Cách hoạt động, Giới thiệu)", (await vis(p, ".landing-nav")) && /Khám phá/.test(await p.textContent(".landing-nav")) && /Cách hoạt động/.test(await p.textContent(".landing-nav")) && /Giới thiệu/.test(await p.textContent(".landing-nav")));
  check("trang chu: khong co breadcrumb Dashboard", !(await vis(p, ".crumbs")));
  check("trang chu: chua co vi -> khong co nut 'Vao ung dung' o goc", !(await vis(p, "#btnEnterApp")));
  check("trang chu: co nut Ket noi MetaMask", await vis(p, "#btnConnect"));
  const w = await p.evaluate(() => { const r = document.querySelector("#view-home .home-hero-full").getBoundingClientRect(); const cs = getComputedStyle(document.querySelector("#view-home .home-hero-full")); return { left: r.left, width: r.width, vw: innerWidth, radius: cs.borderTopLeftRadius, border: cs.borderTopWidth }; });
  check("hero tran toan trang: khong khung, khong bo goc", w.left === 0 && Math.abs(w.width - w.vw) <= 20 && w.radius === "0px" && w.border === "0px", JSON.stringify(w));
  check("hero co hinh minh hoa ben phai", await vis(p, "#view-home .hero-art svg"));
  check("co section thu hai: 3 buoc + CTA", (await p.locator("#view-home .home-step").count()) === 3 && (await p.locator("#view-home .home-cta").count()) === 1);
  check("khong trung id gradient voi Dashboard", await p.evaluate(() => { const ids = [...document.querySelectorAll("[id]")].map((n) => n.id); return ids.length === new Set(ids).size; }));
  await p.screenshot({ path: S + "/landing_01_home.png" });
  await p.screenshot({ path: S + "/landing_01b_full.png", fullPage: true });

  // 2) bấm 'Cách hoạt động' -> vẫn ở trang chủ (chỉ cuộn)
  await p.click("#homeNavHow");
  await p.waitForTimeout(300);
  check("Cach hoat dong: van o trang chu", await p.evaluate(() => document.body.classList.contains("landing")));

  // 3) bấm 'Khám phá' ở thanh trên -> vào ứng dụng có thanh bên
  await p.click(".landing-nav [data-route=elections]");
  await p.waitForTimeout(400);
  check("bam Kham pha: hash #/elections", /#\/elections/.test(await p.evaluate(() => location.hash)));
  check("vao ung dung: co thanh ben", await vis(p, "#sidebar"));
  check("vao ung dung: het che do landing", !(await p.evaluate(() => document.body.classList.contains("landing"))));
  await p.screenshot({ path: S + "/landing_02_app.png" });

  // 4) bấm logo trên thanh bên -> về trang chủ
  await p.click("#sidebar .brand");
  await p.waitForTimeout(400);
  check("bam logo: ve trang chu", await p.evaluate(() => document.body.classList.contains("landing") && !document.getElementById("view-home").hidden));
  check("bam logo: thanh ben an lai", !(await vis(p, "#sidebar")));

  // 5) nút giữa trang
  await p.click("#view-home .hero-actions [data-route=dashboard]");
  await p.waitForTimeout(300);
  check("nut 'Vao ung dung' giua trang -> Dashboard co thanh ben", (await vis(p, "#sidebar")) && /#\/dashboard/.test(await p.evaluate(() => location.hash)));

  // 6) liên kết chia sẻ (?election=N) không bị chặn ở trang chủ
  const p2 = await mk({ viewport: { width: 1280, height: 800 } });
  await p2.goto(URL + "?election=1");
  await p2.waitForTimeout(600);
  check("lien ket chia se ?election=N: khong o trang chu", !(await p2.evaluate(() => document.body.classList.contains("landing"))));

  // 7) có ví -> thấy nút 'Vào ứng dụng' ở góc, vẫn thấy trang chủ trước
  const p3 = await mk({ viewport: { width: 1280, height: 800 } }, true);
  await p3.goto(URL + "?chain=31337&contract=0x5FbDB2315678afecb367f032d93F642f64180aa3");
  await p3.waitForFunction(() => window.__votechain && window.__votechain.S.account, null, { timeout: 15000 }).catch(() => {});
  await p3.waitForTimeout(500);
  check("da ket noi vi: van thay trang chu", await p3.evaluate(() => document.body.classList.contains("landing")));
  check("da ket noi vi: co nut 'Vao ung dung' o goc", await vis(p3, "#btnEnterApp"));
  await p3.click("#btnEnterApp");
  await p3.waitForTimeout(300);
  check("bam 'Vao ung dung': Dashboard co thanh ben", await vis(p3, "#sidebar"));

  // 8) điện thoại 390px: không tràn ngang
  const p4 = await mk({ viewport: { width: 390, height: 800 } });
  await p4.goto(URL);
  await p4.waitForTimeout(500);
  check("di dong 390px: khong tran ngang o trang chu", await p4.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await p4.screenshot({ path: S + "/landing_03_mobile.png", fullPage: true });

  check("khong co loi JS", log.length === 0, log.join(" | "));
  await browser.close();
  console.log(`\n${ok} dat / ${bad} loi`);
  process.exit(bad ? 1 : 0);
})();
