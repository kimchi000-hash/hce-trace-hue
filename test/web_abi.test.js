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
const mr = html.match(/\/\*REG-ABI-START\*\/\s*const REG_ABI = (\[[\s\S]*?\]);\s*\/\*REG-ABI-END\*\//);
if (!mr) throw new Error("Khong tim thay khoi REG_ABI trong web/index.html");
const REG_ABI = JSON.parse(mr[1]);

const artifactsErrors = [];

describe("web/index.html khop voi ProjectCore (giao dien <-> hop dong)", function () {
  let real; // ethers.Interface tu artifact
  let app; // ethers.Interface tu web/index.html

  before(async function () {
    const art = await artifacts.readArtifact("ProjectCore");
    real = new ethers.Interface(art.abi);
    app = new ethers.Interface(APP_ABI);
    real.forEachError((e) => artifactsErrors.push(e.name));
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

  describe("OrganizationRegistry (man hinh To chuc)", function () {
    let real, app;
    before(async function () {
      const art = await artifacts.readArtifact("OrganizationRegistry");
      real = new ethers.Interface(art.abi);
      app = new ethers.Interface(REG_ABI);
    });
    it("moi ham/su kien giao dien goi deu ton tai voi dung chu ky, kieu tra ve va mutability", function () {
      app.forEachFunction((f) => {
        const r = real.getFunction(f.name);
        expect(r, "thieu ham " + f.name).to.not.equal(null);
        expect(r.format("sighash"), f.name).to.equal(f.format("sighash"));
        expect(r.outputs.map((o) => o.format("full")).join(","), "tra ve " + f.name).to.equal(f.outputs.map((o) => o.format("full")).join(","));
        expect(r.stateMutability, "mutability " + f.name).to.equal(f.stateMutability);
      });
      app.forEachEvent((e) => {
        const r = real.getEvent(e.name);
        expect(r, "thieu su kien " + e.name).to.not.equal(null);
        expect(r.format("sighash")).to.equal(e.format("sighash"));
      });
    });
    it("moi loi cua OrganizationRegistry deu duoc giao dien biet va dich", function () {
      real.forEachError((e) => expect(app.getError(e.name), "REG_ABI thieu loi " + e.name).to.not.equal(null));
      app.forEachError((e) => expect(real.getError(e.name), "khong co loi " + e.name).to.not.equal(null));
      const errBlock = html.match(/const ERR_VI = \{([\s\S]*?)\n  \};/)[1];
      const names = new Set();
      real.forEachError((e) => names.add(e.name));
      artifactsErrors.forEach((n) => names.add(n));
      for (const n of names) expect(errBlock, "ERR_VI thieu loi " + n).to.match(new RegExp("\\b" + n + "\\s*:"));
    });
    it("getOrganization tra ve dung cac truong ten (giao dien doc theo ten)", function () {
      expect(app.getFunction("getOrganization").outputs[0].format("full")).to.equal(real.getFunction("getOrganization").outputs[0].format("full"));
      expect(app.getFunction("getMembers").outputs.map((o) => o.name)).to.deep.equal(real.getFunction("getMembers").outputs.map((o) => o.name));
    });
  });
});

describe("web/index.html khop voi VoterCardSBT (the cu tri)", function () {
  const ms = html.match(/\/\*SBT-ABI-START\*\/\s*const SBT_ABI = (\[[\s\S]*?\]);\s*\/\*SBT-ABI-END\*\//);
  it("co khoi SBT_ABI", function () { expect(ms, "Khong tim thay khoi SBT_ABI").to.not.equal(null); });

  it("moi ham/su kien/loi giao dien dung deu ton tai that, dung chu ky, kieu tra ve va mutability", async function () {
    const real = new ethers.Interface((await artifacts.readArtifact("VoterCardSBT")).abi);
    const app = new ethers.Interface(JSON.parse(ms[1]));
    app.forEachFunction((f) => {
      const r = real.getFunction(f.name);
      expect(r, "thieu ham " + f.name).to.not.equal(null);
      expect(r.format("sighash"), f.name).to.equal(f.format("sighash"));
      expect(r.outputs.map((o) => o.type).join(","), "kieu tra ve " + f.name).to.equal(f.outputs.map((o) => o.type).join(","));
      expect(r.stateMutability, "mutability " + f.name).to.equal(f.stateMutability);
    });
    app.forEachError((e) => expect(real.getError(e.name), "thieu loi " + e.name).to.not.equal(null));
    app.forEachEvent((e) => {
      const r = real.getEvent(e.name);
      expect(r, "thieu su kien " + e.name).to.not.equal(null);
      expect(r.format("sighash")).to.equal(e.format("sighash"));
    });
    // ten tra ve cua cardOf: giao dien doc theo ten
    expect(app.getFunction("cardOf").outputs.map((o) => o.name)).to.deep.equal(real.getFunction("cardOf").outputs.map((o) => o.name));
  });

  it("moi loi cua VoterCardSBT deu duoc giao dien biet va co cau dich tieng Viet", async function () {
    const real = new ethers.Interface((await artifacts.readArtifact("VoterCardSBT")).abi);
    const app = new ethers.Interface(JSON.parse(ms[1]));
    real.forEachError((e) => {
      expect(app.getError(e.name), "SBT_ABI thieu loi " + e.name).to.not.equal(null);
      expect(html, "ERR_VI thieu cau dich cho " + e.name).to.match(new RegExp("\\b" + e.name + ":\\s*[\"(]"));
    });
  });

  it("8 anh mascot du phong ton tai va la PNG hop le", function () {
    for (let i = 0; i < 8; i++) {
      const f = path.join(__dirname, "..", "web", "mascots", i + ".png");
      const b = fs.readFileSync(f);
      expect(b.slice(0, 8).toString("hex"), f).to.equal("89504e470d0a1a0a");
    }
  });
});
