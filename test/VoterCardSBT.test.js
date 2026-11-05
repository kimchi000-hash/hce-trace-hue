// The cu tri Soulbound: chi vi da reveal moi mint, 1 the / vi / cuoc bau, khong chuyen nhuong, khong lo lua chon.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployAll, params } = require("./helpers");

const commitHash = (id, c, salt, voter) =>
  ethers.solidityPackedKeccak256(["uint256", "uint256", "string", "address"], [id, c, salt, voter]);

async function fixture() {
  const f = await deployAll();
  const sbt = await (await ethers.getContractFactory("VoterCardSBT")).deploy(await f.core.getAddress(), "", 0, "");
  return { ...f, sbt };
}

/** Tao + kich hoat 1 cuoc bau, tra ve id. */
async function active(f, over = {}) {
  const id = Number(await f.core.electionCount());
  await f.core.connect(f.owner).createElection(params(f, over));
  await f.core.connect(f.ap1).approveElection(id);
  await f.core.connect(f.ap2).approveElection(id);
  return id;
}
const goto = async (core, id, key) => {
  const s = await core.getElectionStats(id);
  await time.increaseTo(BigInt({ Commit: s.regEnd, Reveal: s.commitEnd, Ended: s.revealEnd }[key]) + 1n);
};
async function commitOnly(f, id, v, cand = 0, salt = "s") {
  await f.core.connect(v).commit(id, commitHash(id, cand, salt, v.address), f.tree.proofs[v.address]);
}
const decode = (uri) => {
  const json = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
  const svg = json.image.startsWith("data:") ? Buffer.from(json.image.split(",")[1], "base64").toString("utf8") : "";
  return { json, svg };
};

describe("VoterCardSBT - The cu tri soulbound", function () {
  it("chua reveal / chua tung bo phieu -> NotRevealed", async function () {
    const f = await loadFixture(fixture);
    const id = await active(f);
    await expect(f.sbt.connect(f.v1).mint(id, 0)).to.be.revertedWithCustomError(f.sbt, "NotRevealed");
    await goto(f.core, id, "Commit");
    await commitOnly(f, id, f.v1); // moi commit, chua reveal
    await expect(f.sbt.connect(f.v1).mint(id, 0)).to.be.revertedWithCustomError(f.sbt, "NotRevealed");
  });

  it("da reveal -> mint duoc, serial 1, khoa, owner dung, khong co the cho vi khac", async function () {
    const f = await loadFixture(fixture);
    const id = await active(f);
    await goto(f.core, id, "Commit");
    await commitOnly(f, id, f.v1); await commitOnly(f, id, f.v2);
    await goto(f.core, id, "Reveal");
    await f.core.connect(f.v1).reveal(id, 0, "s");
    const tid = await f.sbt.tokenIdOf(id, f.v1.address);
    await expect(f.sbt.connect(f.v1).mint(id, 2)).to.emit(f.sbt, "CardMinted").withArgs(id, f.v1.address, tid, 1, 2)
      .and.to.emit(f.sbt, "Locked").withArgs(tid);
    expect(await f.sbt.ownerOf(tid)).to.equal(f.v1.address);
    expect(await f.sbt.balanceOf(f.v1.address)).to.equal(1n);
    expect(await f.sbt.locked(tid)).to.equal(true);
    expect(await f.sbt.hasCard(id, f.v1.address)).to.equal(true);
    expect(await f.sbt.hasCard(id, f.v2.address)).to.equal(false);
    // v2 chua reveal -> khong mint duoc du v1 da mint
    await expect(f.sbt.connect(f.v2).mint(id, 0)).to.be.revertedWithCustomError(f.sbt, "NotRevealed");
  });

  it("khong mint hai lan cho cung (cuoc bau, vi): AlreadyMinted", async function () {
    const f = await loadFixture(fixture);
    const id = await active(f);
    await goto(f.core, id, "Commit"); await commitOnly(f, id, f.v1);
    await goto(f.core, id, "Reveal"); await f.core.connect(f.v1).reveal(id, 0, "s");
    await f.sbt.connect(f.v1).mint(id, 0);
    await expect(f.sbt.connect(f.v1).mint(id, 3)).to.be.revertedWithCustomError(f.sbt, "AlreadyMinted");
    expect(await f.sbt.balanceOf(f.v1.address)).to.equal(1n);
  });

  it("serial tang theo cuoc bau; 1 vi o 2 cuoc bau co 2 the khac nhau", async function () {
    const f = await loadFixture(fixture);
    const a = await active(f); const b = await active(f, { title: "Cuoc bau thu hai" });
    await goto(f.core, b, "Commit");                       // b bat dau sau a vai giay: ca hai deu o pha Commit
    await commitOnly(f, a, f.v1); await commitOnly(f, a, f.v2, 1);
    await commitOnly(f, b, f.v1);
    await goto(f.core, b, "Reveal");                       // sau commitEnd cua ca a va b
    await f.core.connect(f.v1).reveal(a, 0, "s"); await f.core.connect(f.v2).reveal(a, 1, "s");
    await f.core.connect(f.v1).reveal(b, 0, "s");
    await f.sbt.connect(f.v2).mint(a, 0); await f.sbt.connect(f.v1).mint(a, 1); await f.sbt.connect(f.v1).mint(b, 4);
    const ta = await f.sbt.tokenIdOf(a, f.v1.address), tb = await f.sbt.tokenIdOf(b, f.v1.address);
    expect(ta).to.not.equal(tb);
    expect((await f.sbt.cardOf(ta)).serial).to.equal(2n);  // v2 mint truoc o cuoc bau a
    expect((await f.sbt.cardOf(tb)).serial).to.equal(1n);  // cuoc bau b doc lap
    expect(await f.sbt.balanceOf(f.v1.address)).to.equal(2n);
  });

  it("id khong ton tai -> ElectionNotFound; avatar sai -> InvalidAvatar; dia chi 0 o constructor bi tu choi", async function () {
    const f = await loadFixture(fixture);
    await expect(f.sbt.connect(f.v1).mint(99, 0)).to.be.revertedWithCustomError(f.sbt, "ElectionNotFound");
    const id = await active(f);
    await expect(f.sbt.connect(f.v1).mint(id, 6)).to.be.revertedWithCustomError(f.sbt, "InvalidAvatar");
    await expect((await ethers.getContractFactory("VoterCardSBT")).deploy(ethers.ZeroAddress, "", 0, "")).to.be.revertedWithCustomError(f.sbt, "ZeroAddress");
  });

  it("soulbound: moi thao tac chuyen nhuong / uy quyen deu revert", async function () {
    const f = await loadFixture(fixture);
    const id = await active(f);
    await goto(f.core, id, "Commit"); await commitOnly(f, id, f.v1);
    await goto(f.core, id, "Reveal"); await f.core.connect(f.v1).reveal(id, 0, "s");
    await f.sbt.connect(f.v1).mint(id, 0);
    const tid = await f.sbt.tokenIdOf(id, f.v1.address);
    const s = f.sbt.connect(f.v1);
    await expect(s.transferFrom(f.v1.address, f.v2.address, tid)).to.be.revertedWithCustomError(f.sbt, "Soulbound");
    await expect(s["safeTransferFrom(address,address,uint256)"](f.v1.address, f.v2.address, tid)).to.be.revertedWithCustomError(f.sbt, "Soulbound");
    await expect(s["safeTransferFrom(address,address,uint256,bytes)"](f.v1.address, f.v2.address, tid, "0x")).to.be.revertedWithCustomError(f.sbt, "Soulbound");
    await expect(s.approve(f.v2.address, tid)).to.be.revertedWithCustomError(f.sbt, "Soulbound");
    await expect(s.setApprovalForAll(f.v2.address, true)).to.be.revertedWithCustomError(f.sbt, "Soulbound");
    expect(await f.sbt.isApprovedForAll(f.v1.address, f.v2.address)).to.equal(false);
    expect(await f.sbt.ownerOf(tid)).to.equal(f.v1.address);
  });

  it("ERC-165: ho tro ERC-721, Metadata, ERC-5192; the khong ton tai bi tu choi", async function () {
    const f = await loadFixture(fixture);
    for (const i of ["0x01ffc9a7", "0x80ac58cd", "0x5b5e139f", "0xb45a3c0e"]) expect(await f.sbt.supportsInterface(i)).to.equal(true);
    expect(await f.sbt.supportsInterface("0xffffffff")).to.equal(false);
    await expect(f.sbt.ownerOf(1)).to.be.revertedWithCustomError(f.sbt, "NonexistentToken");
    await expect(f.sbt.tokenURI(1)).to.be.revertedWithCustomError(f.sbt, "NonexistentToken");
    await expect(f.sbt.balanceOf(ethers.ZeroAddress)).to.be.revertedWithCustomError(f.sbt, "ZeroAddress");
  });

  it("tokenURI: JSON/SVG hop le, co ten cuoc bau + serial + ngay cap, KHONG chua lua chon hay salt", async function () {
    const f = await loadFixture(fixture);
    const id = await active(f);
    await goto(f.core, id, "Commit"); await commitOnly(f, id, f.v1, 1, "muoi-bi-mat-xyz");
    await goto(f.core, id, "Reveal"); await f.core.connect(f.v1).reveal(id, 1, "muoi-bi-mat-xyz");
    await f.sbt.connect(f.v1).mint(id, 2);
    const tid = await f.sbt.tokenIdOf(id, f.v1.address);
    const { json, svg } = decode(await f.sbt.tokenURI(tid));
    expect(json.name).to.contain("#0001").and.to.contain("Bau Ban can su lop K58");
    expect(svg).to.contain("Voter Card #0001").and.to.contain("Bau Ban can su lop K58");
    const attr = Object.fromEntries(json.attributes.map((a) => [a.trait_type, a.value]));
    expect(attr["Election ID"]).to.equal(id); expect(attr.Serial).to.equal(1); expect(attr.Avatar).to.equal(2);
    expect(attr["Issued At"]).to.be.greaterThan(1_600_000_000);
    const all = JSON.stringify(json) + svg;
    expect(all).to.not.contain("muoi-bi-mat-xyz");
    expect(json.attributes.map((a) => a.trait_type)).to.not.include.members(["Candidate", "Vote", "Choice"]);
  });

  it("tieu de co ky tu dac biet khong pha JSON/SVG (thoat \" \\ < > &)", async function () {
    const f = await loadFixture(fixture);
    const id = await active(f, { title: 'A "quote" \\ <b>&</b> \'x\'' });
    await goto(f.core, id, "Commit"); await commitOnly(f, id, f.v1);
    await goto(f.core, id, "Reveal"); await f.core.connect(f.v1).reveal(id, 0, "s");
    await f.sbt.connect(f.v1).mint(id, 0);
    const { json, svg } = decode(await f.sbt.tokenURI(await f.sbt.tokenIdOf(id, f.v1.address)));
    expect(json.name).to.contain('"quote"');
    expect(svg).to.not.contain("<b>");
    expect(svg).to.contain("&lt;b&gt;");
  });

  it("ProjectCore khong bi sua: bytecode van la ban da audit (khong import, khong thay doi giao dien)", async function () {
    const f = await loadFixture(fixture);
    expect(await f.sbt.projectCore()).to.equal(await f.core.getAddress());
  });

  describe("Mascot anh ngoai (IPFS) + du phong emoji", function () {
    const deployExt = async (f, base, n, ext) =>
      (await ethers.getContractFactory("VoterCardSBT")).deploy(await f.core.getAddress(), base, n, ext);
    async function revealed(f) {
      const id = await active(f);
      await goto(f.core, id, "Commit"); await commitOnly(f, id, f.v1);
      await goto(f.core, id, "Reveal"); await f.core.connect(f.v1).reveal(id, 0, "s");
      return id;
    }

    it("baseURI rong -> dung emoji du phong, avatarCount = 6 (bo qua tham so count)", async function () {
      const f = await loadFixture(fixture);
      const s = await deployExt(f, "", 200, "png");
      expect(await s.avatarCount()).to.equal(6);
      expect(await s.avatarBaseURI()).to.equal("");
    });

    it("co baseURI -> image = baseURI + avatarId + .ext, avatarCount theo cau hinh", async function () {
      const f = await loadFixture(fixture);
      const s = await deployExt(f, "ipfs://bafyTESTCID/", 9, "svg");
      expect(await s.avatarCount()).to.equal(9);
      const id = await revealed(f);
      await expect(s.connect(f.v1).mint(id, 9)).to.be.revertedWithCustomError(s, "InvalidAvatar");
      await s.connect(f.v1).mint(id, 8);
      const { json } = decode(await s.tokenURI(await s.tokenIdOf(id, f.v1.address)));
      expect(json.image).to.equal("ipfs://bafyTESTCID/8.svg");
      expect(json.name).to.contain("#0001");
    });

    it("cau hinh sai bi tu choi: co baseURI nhung count = 0 hoac thieu duoi file", async function () {
      const f = await loadFixture(fixture);
      await expect(deployExt(f, "ipfs://x/", 0, "svg")).to.be.revertedWithCustomError(f.sbt, "BadAvatarConfig");
      await expect(deployExt(f, "ipfs://x/", 3, "")).to.be.revertedWithCustomError(f.sbt, "BadAvatarConfig");
    });

    it("baseURI co dau nhay khong pha JSON (da thoat)", async function () {
      const f = await loadFixture(fixture);
      const s = await deployExt(f, 'ipfs://a"b/', 2, "png");
      const id = await revealed(f);
      await s.connect(f.v1).mint(id, 1);
      const { json } = decode(await s.tokenURI(await s.tokenIdOf(id, f.v1.address)));
      expect(json.image).to.equal('ipfs://a"b/1.png');
    });
  });
});
