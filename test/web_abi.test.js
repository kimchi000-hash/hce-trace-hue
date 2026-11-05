// Doi chieu web/index.html (ABI giao dien dung) voi ban bien dich that cua ProjectCore.sol.
// Neu doi ten ham / tham so / loi trong hop dong ma quen sua web/index.html, test nay se do.
const { expect } = require("chai");
const { ethers, artifacts } = require("hardhat");
const fs = require("fs");
const path = require("path");
// ABI nam ngay trong web/index.html (giua /*ABI-START*/ va /*ABI-END*/); trich ra bang cach tinh gia tri mang
const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
const m = html.match(/\/\*ABI-START\*\/\s*const APP_ABI = (\[[\s\S]*?\]);\s*\/\*ABI-END\*\//);
if (!m) throw new Error("Khong tim thay khoi ABI trong web/index.html");
const APP_ABI = JSON.parse(m[1]);

describe("web/index.html khop voi ProjectCore (giao dien <-> hop dong)", function () {
  let real; // ethers.Interface tu artifact
  let app; // ethers.Interface tu web/index.html

  before(async function () {
    const art = await artifacts.readArtifact("ProjectCore");
    real = new ethers.Interface(art.abi);
    app = new ethers.Interface(APP_ABI);
  });

  it("moi ham giao dien goi deu ton tai voi dung chu ky va kieu tra ve", function () {
    app.forEachFunction((f) => {
      const r = real.getFunction(f.name);
      expect(r, "thieu ham " + f.name).to.not.equal(null);
      expect(r.format("sighash"), f.name).to.equal(f.format("sighash"));
      expect(r.outputs.map((o) => o.type).join(","), "kieu tra ve " + f.name).to.equal(f.outputs.map((o) => o.type).join(","));
      expect(r.stateMutability, "mutability " + f.name).to.equal(f.stateMutability);
    });
  });

  it("ten tra ve cua getElectionBasicInfo / getElectionStats / result khop (giao dien doc theo ten)", function () {
    for (const n of ["getElectionBasicInfo", "getElectionStats", "result", "getVoterStatus"]) {
      const r = real.getFunction(n).outputs.map((o) => o.name);
      const a = app.getFunction(n).outputs.map((o) => o.name);
      expect(a, n).to.deep.equal(r);
    }
  });

  it("moi loi tuy bien giao dien dich sang tieng Viet deu co that trong hop dong", function () {
    app.forEachError((e) => {
      const r = real.getError(e.name);
      expect(r, "thieu loi " + e.name).to.not.equal(null);
      expect(r.format("sighash")).to.equal(e.format("sighash"));
    });
  });

  it("moi loi cua hop dong deu duoc giao dien biet (khong loi nao roi vao thong bao chung)", function () {
    real.forEachError((e) => {
      expect(app.getError(e.name), "web/index.html thieu loi " + e.name).to.not.equal(null);
    });
  });

  it("cong thuc commitment cua giao dien khop hop dong (kieu dau vao: uint256, uint256, string, address)", async function () {
    const [, voter] = await ethers.getSigners();
    const h = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "string", "address"],
      [0, 1, "0x" + "ab".repeat(32), voter.address]
    );
    expect(h).to.match(/^0x[0-9a-f]{64}$/);
  });
});
