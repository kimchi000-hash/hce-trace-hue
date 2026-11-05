// Kiem thu script trien khai (scripts/deploy_sepolia.js) va script gan dia chi vao giao dien, tren mang Hardhat cuc bo.
const { expect } = require("chai");
const hre = require("hardhat");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { deploy, nextSteps } = require("../scripts/deploy_sepolia.js");
const { apply } = require("../scripts/apply_deployment.js");

describe("scripts/deploy_sepolia.js + apply_deployment.js", function () {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "votechain-deploy-")); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const quiet = () => {};

  it("deploy hai hop dong, noi dung chung, ghi file ket qua day du va CHI co thong tin cong khai", async function () {
    const out = path.join(dir, "d.json");
    const r = await deploy(hre, { out, log: quiet });
    const [admin] = await hre.ethers.getSigners();
    expect(r.platformAdmin).to.equal(admin.address);
    const core = await hre.ethers.getContractAt("ProjectCore", r.core.address);
    expect(await core.registry()).to.equal(r.registry.address);
    expect(r.deployBlock).to.equal(Math.min(r.registry.block, r.core.block));
    expect(r.registry.block).to.be.lessThan(r.core.block);   // registry duoc deploy truoc
    const txt = fs.readFileSync(out, "utf8");
    expect(JSON.parse(txt)).to.deep.equal(r);
    expect(txt).to.not.match(/privateKey|PRIVATE_KEY|mnemonic|secret/i);
    expect(Object.keys(r).sort()).to.deep.equal(["chainId", "core", "deployBlock", "deployedAt", "deployer", "network", "platformAdmin", "registry"]);
  });

  it("khong ghi de ket qua da co (tranh deploy lan 2 vo y); FORCE moi cho phep", async function () {
    const out = path.join(dir, "d.json");
    const first = await deploy(hre, { out, log: quiet });
    let err = null;
    try { await deploy(hre, { out, log: quiet }); } catch (e) { err = e; }
    expect(err && err.message).to.match(/Da co .* deploy roi/);
    expect(JSON.parse(fs.readFileSync(out, "utf8")).core.address).to.equal(first.core.address);
    const again = await deploy(hre, { out, log: quiet, force: true });
    expect(again.core.address).to.not.equal(first.core.address);
  });

  it("tu choi khi sai chainId", async function () {
    let err = null;
    try { await deploy(hre, { out: path.join(dir, "x.json"), log: quiet, expectedChainId: 11155111 }); } catch (e) { err = e; }
    expect(err && err.message).to.match(/Sai mang/);
    expect(fs.existsSync(path.join(dir, "x.json"))).to.equal(false);
  });

  it("nextSteps in dung dia chi va deployBlock", async function () {
    const r = await deploy(hre, { out: path.join(dir, "d.json"), log: quiet });
    const t = nextSteps(r);
    expect(t).to.include("REGISTRY_ADDRESS=" + r.registry.address).and.include("CORE_ADDRESS=" + r.core.address).and.include("DEPLOY_BLOCK=" + r.deployBlock);
  });

  it("apply_deployment chi doi CONTRACT_ADDRESS va CHAIN_ID trong CONFIG, khong dong vao noi dung khac", async function () {
    const real = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
    const html = path.join(dir, "index.html");
    fs.writeFileSync(html, real);
    const r = await deploy(hre, { out: path.join(dir, "d.json"), log: quiet });
    apply(path.join(dir, "d.json"), html);
    const after = fs.readFileSync(html, "utf8");
    expect(after).to.include('CONTRACT_ADDRESS: "' + r.core.address + '"');
    expect(after).to.include("CHAIN_ID: " + r.chainId + ",");
    // khac biet duy nhat la hai dong cau hinh
    const a = real.split("\n"), b = after.split("\n");
    expect(b.length).to.equal(a.length);
    const diff = a.map((l, i) => (l === b[i] ? null : i)).filter((x) => x !== null);
    expect(diff.length).to.be.at.most(2);
    for (const i of diff) expect(a[i]).to.match(/CONTRACT_ADDRESS|CHAIN_ID/);
    // chay lai y het: khong doi gi them
    apply(path.join(dir, "d.json"), html);
    expect(fs.readFileSync(html, "utf8")).to.equal(after);
  });

  it("apply_deployment tu choi file hong va khong ghi gi", function () {
    const html = path.join(dir, "index.html");
    fs.writeFileSync(html, "<html></html>");
    fs.writeFileSync(path.join(dir, "bad.json"), JSON.stringify({ chainId: 1, core: { address: "khong-phai-dia-chi" } }));
    expect(() => apply(path.join(dir, "bad.json"), html)).to.throw(/khong hop le/);
    fs.writeFileSync(path.join(dir, "ok.json"), JSON.stringify({ chainId: 1, core: { address: "0x" + "ab".repeat(20) } }));
    expect(() => apply(path.join(dir, "ok.json"), html)).to.throw(/Khong tim thay/);
    expect(fs.readFileSync(html, "utf8")).to.equal("<html></html>");
  });
});
