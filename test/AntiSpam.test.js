// Kiem thu chong spam yeu cau tao cuoc bau cu: han muc theo vi / theo to chuc, rut yeu cau, het han, giai phong han muc.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { Role, Req, deployAll, params } = require("./helpers");

const create = (f, who, over) => f.core.connect(who).createElection(params(f, over));
const approveAll = async (f, id) => { await f.core.connect(f.ap1).approveElection(id); await f.core.connect(f.ap2).approveElection(id); };

describe("Chong spam yeu cau tao cuoc bau cu", function () {
  it("gia tri khoi dau: 3 yeu cau / vi, 10 yeu cau / to chuc, het han 7 ngay", async function () {
    const f = await loadFixture(deployAll);
    expect(await f.core.maxPendingPerWallet()).to.equal(3);
    expect(await f.core.maxPendingPerOrg()).to.equal(10);
    expect(await f.core.pendingTtl()).to.equal(7 * 24 * 3600);
  });

  it("[9] vuot 3 yeu cau dang cho tren moi vi -> PendingLimit; vi khac van tao duoc", async function () {
    const f = await loadFixture(deployAll);
    for (let i = 0; i < 3; i++) await create(f, f.p1);
    await expect(create(f, f.p1)).to.be.revertedWithCustomError(f.core, "PendingLimit");
    expect(await f.core.pendingCountOfWallet(f.p1.address)).to.equal(3);
    await expect(create(f, f.p2)).to.emit(f.core, "ElectionCreated");
  });

  it("[9] vuot 10 yeu cau dang cho tren moi to chuc -> PendingLimit du moi vi chua cham han muc vi", async function () {
    const f = await loadFixture(deployAll);
    for (const who of [f.p1, f.p2, f.p3]) for (let i = 0; i < 3; i++) await create(f, who);
    await create(f, f.p4);                                              // yeu cau thu 10
    expect(await f.core.pendingCountOfOrg(1)).to.equal(10);
    await expect(create(f, f.p4)).to.be.revertedWithCustomError(f.core, "PendingLimit");
  });

  it("[10] nguoi tao RUT yeu cau -> giai phong han muc; chi nguoi tao rut duoc", async function () {
    const f = await loadFixture(deployAll);
    for (let i = 0; i < 3; i++) await create(f, f.p1);
    await expect(f.core.connect(f.p2).withdrawElection(0)).to.be.revertedWithCustomError(f.core, "NotAuthorized");
    await expect(f.core.connect(f.p1).withdrawElection(0)).to.emit(f.core, "ElectionWithdrawn").withArgs(0);
    expect(await f.core.requestStatus(0)).to.equal(Req.Withdrawn);
    expect(await f.core.pendingCountOfWallet(f.p1.address)).to.equal(2);
    await expect(create(f, f.p1)).to.emit(f.core, "ElectionCreated");
    await expect(f.core.connect(f.ap1).approveElection(0)).to.be.revertedWithCustomError(f.core, "RequestClosed");
  });

  it("rut yeu cau bi KHOA khi da co chu ky duyet / tu choi, hoac da kich hoat; khong rut hai lan", async function () {
    const f = await loadFixture(deployAll);
    await create(f, f.p1); await create(f, f.p1); await create(f, f.p1);
    await f.core.connect(f.ap1).approveElection(0);
    await expect(f.core.connect(f.p1).withdrawElection(0)).to.be.revertedWithCustomError(f.core, "RequestLocked");
    await f.core.connect(f.ap2).approveElection(0);
    await expect(f.core.connect(f.p1).withdrawElection(0)).to.be.revertedWithCustomError(f.core, "RequestClosed");
    await f.core.connect(f.p1).withdrawElection(1);
    await expect(f.core.connect(f.p1).withdrawElection(1)).to.be.revertedWithCustomError(f.core, "RequestClosed");
    await f.core.connect(f.ap1).rejectElection(2);
    await expect(f.core.connect(f.p1).withdrawElection(2)).to.be.revertedWithCustomError(f.core, "RequestClosed"); // da bi tu choi
  });

  it("[10] yeu cau bi TU CHOI -> giai phong han muc", async function () {
    const f = await loadFixture(deployAll);
    for (let i = 0; i < 3; i++) await create(f, f.p1);
    await f.core.connect(f.ap1).rejectElection(1);
    expect(await f.core.pendingCountOfWallet(f.p1.address)).to.equal(2);
    expect(await f.core.pendingCountOfOrg(1)).to.equal(2);
    await expect(create(f, f.p1)).to.emit(f.core, "ElectionCreated");
  });

  it("yeu cau duoc DUYET (kich hoat) khong con chiem han muc cho duyet", async function () {
    const f = await loadFixture(deployAll);
    for (let i = 0; i < 3; i++) await create(f, f.p1);
    await approveAll(f, 0);
    expect(await f.core.pendingCountOfWallet(f.p1.address)).to.equal(2);
    await expect(create(f, f.p1)).to.emit(f.core, "ElectionCreated");
  });

  it("[10] yeu cau HET HAN khong chiem han muc: tao moi duoc ngay du chua ai goi don dep", async function () {
    const f = await loadFixture(deployAll);
    for (let i = 0; i < 3; i++) await create(f, f.p1, { regMinutes: 60 });
    await expect(create(f, f.p1)).to.be.revertedWithCustomError(f.core, "PendingLimit");
    await time.increase(61 * 60);
    expect(await f.core.requestStatus(0)).to.equal(Req.Expired);
    expect(await f.core.pendingCountOfWallet(f.p1.address)).to.equal(0);   // view khong dem yeu cau het han
    await expect(create(f, f.p1)).to.emit(f.core, "ElectionCreated");      // _enqueue tu don yeu cau het han
    expect(await f.core.pendingCountOfWallet(f.p1.address)).to.equal(1);
  });

  it("releaseExpired: ai cung goi duoc sau khi het han, truoc do bi NotExpired; da kich hoat khong coi la het han", async function () {
    const f = await loadFixture(deployAll);
    await create(f, f.p1, { regMinutes: 30 });
    await create(f, f.p1, { regMinutes: 30 });
    await approveAll(f, 1);
    await expect(f.core.connect(f.outsider).releaseExpired(0)).to.be.revertedWithCustomError(f.core, "NotExpired");
    await time.increase(31 * 60);
    await expect(f.core.connect(f.outsider).releaseExpired(0)).to.emit(f.core, "RequestExpired").withArgs(0);
    await expect(f.core.connect(f.outsider).releaseExpired(1)).to.be.revertedWithCustomError(f.core, "NotExpired"); // da kich hoat
  });

  it("KHONG gioi han tong so cuoc bau cu trong vong doi: duyet xong thi tao tiep, 12 cuoc lien tiep tu mot vi", async function () {
    const f = await loadFixture(deployAll);
    for (let i = 0; i < 12; i++) { await create(f, f.p1); await approveAll(f, i); }
    expect(await f.core.electionCount()).to.equal(12);
    expect(await f.core.pendingCountOfWallet(f.p1.address)).to.equal(0);
  });

  it("han muc chi tinh trong tung to chuc: to chuc khac khong bi anh huong", async function () {
    const f = await loadFixture(deployAll);
    await f.registry.connect(f.outsider).registerOrganization("To chuc 2", ethers.ZeroHash);
    await f.registry.connect(f.platform).verifyOrganization(2);
    await f.registry.connect(f.outsider).addMember(2, f.p1.address, Role.Proposer);
    for (const a of [f.ap1, f.ap2]) { await f.registry.connect(f.outsider).addMember(2, a.address, Role.Member); await f.registry.connect(f.outsider).addApprover(2, a.address); }
    for (const who of [f.p1, f.p2, f.p3]) for (let i = 0; i < 3; i++) await create(f, who);
    await create(f, f.p4);
    await expect(create(f, f.p4)).to.be.revertedWithCustomError(f.core, "PendingLimit"); // to chuc 1 day
    // vi p1 da co 3 yeu cau o to chuc 1 nen van bi han muc VI; vi outsider (Manager to chuc 2) tao duoc
    await expect(create(f, f.outsider, { organizationId: 2 })).to.emit(f.core, "ElectionCreated");
  });

  it("setLimits: chi quan tri vien nen tang, trong khoang an toan; ttl moi chan regMinutes qua dai", async function () {
    const f = await loadFixture(deployAll);
    await expect(f.core.connect(f.owner).setLimits(5, 20, 3600)).to.be.revertedWithCustomError(f.core, "NotPlatformAdmin");
    for (const bad of [[0, 10, 86400], [51, 10, 86400], [3, 0, 86400], [3, 201, 86400], [3, 10, 3599], [3, 10, 43201 * 60]])
      await expect(f.core.connect(f.platform).setLimits(...bad)).to.be.revertedWithCustomError(f.core, "InvalidParams");
    await expect(f.core.connect(f.platform).setLimits(1, 20, 2 * 3600)).to.emit(f.core, "LimitsUpdated").withArgs(1, 20, 7200);
    await create(f, f.p1);
    await expect(create(f, f.p1)).to.be.revertedWithCustomError(f.core, "PendingLimit");      // han muc vi = 1
    await expect(create(f, f.p2, { regMinutes: 121 })).to.be.revertedWithCustomError(f.core, "InvalidParams"); // ttl 2 gio
    await expect(create(f, f.p2, { regMinutes: 120 })).to.emit(f.core, "ElectionCreated");
  });

  it("ghi nhan gioi han cua co che: han muc theo vi khong chan duoc Sybil (nhieu vi) nhung bi chan boi han muc to chuc", async function () {
    const f = await loadFixture(deployAll);
    // Mot nguoi dung 4 vi Proposer: moi vi 3 yeu cau = 12 > 10 => han muc TO CHUC la lop chan thu hai
    let ok = 0;
    for (const who of [f.p1, f.p2, f.p3, f.p4]) for (let i = 0; i < 3; i++) { try { await create(f, who); ok++; } catch (_) { break; } }
    expect(ok).to.equal(10);
  });
});
