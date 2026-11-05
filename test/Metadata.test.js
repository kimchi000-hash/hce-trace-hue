// Kiem thu metadata hash: chuan hoa JSON, hash that tu du lieu, ghi len hop dong, phat hien sua, phien ban, khoa khi Commit.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { Req, deployAll, makeMeta, params } = require("./helpers");
const M = require("../scripts/metadata");

const Phase = { Registration: 0n, Commit: 1n, Reveal: 2n, Ended: 3n };

describe("Metadata hash (cuoc bau cu + ung vien)", function () {
  describe("A. Chuan hoa JSON & hash", function () {
    it("cung du lieu, khac thu tu khoa / khoang trang -> cung hash (chuan hoa on dinh)", function () {
      const a = { b: 1, a: { y: [1, 2], x: "t" } };
      const b = JSON.parse('{ "a": {"x":"t", "y":[1,2]},   "b":1 }');
      expect(M.canonicalize(a)).to.equal('{"a":{"x":"t","y":[1,2]},"b":1}');
      expect(M.metadataHash(a)).to.equal(M.metadataHash(b));
    });

    it("chuoi Unicode tuong duong (NFC vs NFD) cho cung hash; khac noi dung cho hash khac; thu tu mang co y nghia", function () {
      const nfc = { t: "Nguyễn" }, nfd = { t: "Nguyễn" };
      expect(nfc.t).to.not.equal(nfd.t);
      expect(M.metadataHash(nfc)).to.equal(M.metadataHash(nfd));
      expect(M.metadataHash({ t: "A" })).to.not.equal(M.metadataHash({ t: "B" }));
      expect(M.metadataHash({ l: [1, 2] })).to.not.equal(M.metadataHash({ l: [2, 1] }));
    });

    it("tu choi so thuc, NaN, undefined, khoa trung sau chuan hoa", function () {
      expect(() => M.canonicalize({ n: 1.5 })).to.throw();
      expect(() => M.canonicalize({ n: NaN })).to.throw();
      expect(() => M.canonicalize({ n: undefined })).to.throw();
      expect(() => M.canonicalize({ "é": 1, "é": 2 })).to.throw();
    });

    it("hash la keccak256 cua bytes UTF-8 (tuong thich ethers / Solidity), khong phai hash gia", function () {
      const o = { k: "v" };
      expect(M.metadataHash(o)).to.equal(ethers.keccak256(ethers.toUtf8Bytes('{"k":"v"}')));
      expect(M.metadataHash(o)).to.not.equal(ethers.ZeroHash);
    });

    it("anh / tai lieu: manifest chua checksum NOI DUNG file; doi 1 byte hoac doi URL khong doi hash noi dung -> phat hien dung", function () {
      const img = new Uint8Array([1, 2, 3, 4, 5]);
      const e1 = M.fileEntry("avatar", "a.png", "image/png", img);
      const tampered = M.fileEntry("avatar", "a.png", "image/png", new Uint8Array([1, 2, 3, 4, 6]));
      expect(e1.checksum).to.equal(ethers.keccak256(img));
      expect(e1.checksum).to.not.equal(tampered.checksum);
      const c = M.candidateMetadata({ index: 0, fullName: "A", avatar: e1 });
      const c2 = M.candidateMetadata({ index: 0, fullName: "A", avatar: tampered });
      expect(M.metadataHash(c)).to.not.equal(M.metadataHash(c2)); // thay anh -> hash ho so ung vien doi
    });
  });

  describe("B. Ghi hash len hop dong", function () {
    it("[11] tao cuoc bau cu ghi hash cuoc bau cu + tung ung vien (phien ban 1) va phat su kien", async function () {
      const f = await loadFixture(deployAll);
      const m = makeMeta(f);
      await expect(f.core.connect(f.p1).createElection(params(f)))
        .to.emit(f.core, "ElectionMetadataSet").withArgs(0, 1, m.metadataHash)
        .and.to.emit(f.core, "CandidateMetadataSet").withArgs(0, 0, 1, m.candidateMetadataHashes[0])
        .and.to.emit(f.core, "CandidateMetadataSet").withArgs(0, 1, 1, m.candidateMetadataHashes[1]);
      const o = await f.core.getElectionOrg(0);
      expect(o.metadataHash).to.equal(m.metadataHash);
      expect(o.metadataVersion).to.equal(1);
      const c1 = await f.core.getCandidateMetadata(0, 1);
      expect(c1.metadataHash).to.equal(m.candidateMetadataHashes[1]);
      expect(c1.version).to.equal(1);
      await expect(f.core.getCandidateMetadata(0, 2)).to.be.revertedWithCustomError(f.core, "InvalidCandidate");
    });

    it("[11/12] hash on-chain khop du lieu that; sua metadata ngoai chuoi -> kiem tra lai hash PHAT HIEN", async function () {
      const f = await loadFixture(deployAll);
      const m = makeMeta(f);
      await f.core.connect(f.p1).createElection(params(f));
      const onchain = (await f.core.getElectionOrg(0)).metadataHash;
      expect(M.verifyMetadata(m.election, onchain)).to.equal(true);
      const forged = { ...m.election, description: m.election.description + " (da bi sua)" };
      expect(M.verifyMetadata(forged, onchain)).to.equal(false);
      const candOn = (await f.core.getCandidateMetadata(0, 0)).metadataHash;
      expect(M.verifyMetadata(m.candidates[0], candOn)).to.equal(true);
      expect(M.verifyMetadata({ ...m.candidates[0], bio: "Tieu su gia mao" }, candOn)).to.equal(false);
      expect(M.verifyMetadata(m.candidates[1], candOn)).to.equal(false); // hoan doi ho so giua 2 ung vien cung bi phat hien (co index)
    });
  });

  describe("C. Cap nhat, phien ban va lich su", function () {
    it("[13] cap nhat truoc khi duyet: tang phien ban, phat su kien, hash cu van con trong lich su su kien", async function () {
      const f = await loadFixture(deployAll);
      const m = makeMeta(f);
      await f.core.connect(f.p1).createElection(params(f));
      const h2 = ethers.id("election-v2"), h3 = ethers.id("election-v3"), c2 = ethers.id("cand0-v2");
      await expect(f.core.connect(f.p1).updateElectionMetadata(0, h2)).to.emit(f.core, "ElectionMetadataSet").withArgs(0, 2, h2);
      await f.core.connect(f.p1).updateElectionMetadata(0, h3);
      await expect(f.core.connect(f.p1).updateCandidateMetadata(0, 0, c2)).to.emit(f.core, "CandidateMetadataSet").withArgs(0, 0, 2, c2);
      const o = await f.core.getElectionOrg(0);
      expect(o.metadataHash).to.equal(h3);
      expect(o.metadataVersion).to.equal(3);
      const logs = await f.core.queryFilter(f.core.filters.ElectionMetadataSet(0));
      expect(logs.map((l) => [l.args.version, l.args.metadataHash])).to.deep.equal([[1n, m.metadataHash], [2n, h2], [3n, h3]]);
      const cl = await f.core.queryFilter(f.core.filters.CandidateMetadataSet(0, 0));
      expect(cl.map((l) => l.args.version)).to.deep.equal([1n, 2n]);
    });

    it("chi nguoi tao duoc sua; hash 0 hoac trung hash hien tai bi tu choi; ung vien khong ton tai bi tu choi", async function () {
      const f = await loadFixture(deployAll);
      const m = makeMeta(f);
      await f.core.connect(f.p1).createElection(params(f));
      for (const who of [f.owner, f.ap1, f.outsider, f.platform]) await expect(f.core.connect(who).updateElectionMetadata(0, ethers.id("x"))).to.be.revertedWithCustomError(f.core, "NotAuthorized");
      await expect(f.core.connect(f.owner).updateCandidateMetadata(0, 0, ethers.id("x"))).to.be.revertedWithCustomError(f.core, "NotAuthorized");
      await expect(f.core.connect(f.p1).updateElectionMetadata(0, ethers.ZeroHash)).to.be.revertedWithCustomError(f.core, "InvalidParams");
      await expect(f.core.connect(f.p1).updateElectionMetadata(0, m.metadataHash)).to.be.revertedWithCustomError(f.core, "InvalidParams");
      await expect(f.core.connect(f.p1).updateCandidateMetadata(0, 0, m.candidateMetadataHashes[0])).to.be.revertedWithCustomError(f.core, "InvalidParams");
      await expect(f.core.connect(f.p1).updateCandidateMetadata(0, 5, ethers.id("x"))).to.be.revertedWithCustomError(f.core, "InvalidCandidate");
    });

    it("sua metadata khi da co chu ky duyet 1/2: chu ky bi dat lai, phai duyet lai tu dau", async function () {
      const f = await loadFixture(deployAll);
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.ap1).approveElection(0);
      await expect(f.core.connect(f.p1).updateElectionMetadata(0, ethers.id("new"))).to.emit(f.core, "ApprovalsReset").withArgs(0);
      expect((await f.core.getElectionStats(0)).approvalCount).to.equal(0);
      expect(await f.core.hasApproved(0, f.ap1.address)).to.equal(false);
      await f.core.connect(f.ap1).approveElection(0);              // duoc duyet lai (khong AlreadyApproved)
      await f.core.connect(f.ap2).approveElection(0);
      expect((await f.core.getElectionBasicInfo(0)).isActivated).to.equal(true);
    });

    it("sua metadata SAU khi da kich hoat nhung truoc Commit: huy kich hoat, ghi hash moi, yeu cau phe duyet lai va quay lai hang cho (chiem han muc)", async function () {
      const f = await loadFixture(deployAll);
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.ap1).approveElection(0);
      await f.core.connect(f.ap2).approveElection(0);
      expect(await f.core.pendingCountOfWallet(f.p1.address)).to.equal(0);
      await f.core.connect(f.p1).updateCandidateMetadata(0, 1, ethers.id("cand1-v2"));
      expect((await f.core.getElectionBasicInfo(0)).isActivated).to.equal(false);
      expect(await f.core.requestStatus(0)).to.equal(Req.Pending);
      expect(await f.core.pendingCountOfWallet(f.p1.address)).to.equal(1);
      await expect(f.core.connect(f.v1).commit(0, ethers.id("c"), f.tree.proofs[f.v1.address])).to.be.reverted; // chua den Commit va chua kich hoat
      await f.core.connect(f.ap1).approveElection(0);
      await f.core.connect(f.ap2).approveElection(0);
      expect((await f.core.getElectionBasicInfo(0)).isActivated).to.equal(true);
    });

    it("sua metadata sau khi kich hoat khi han muc cho duyet da day -> PendingLimit (khong lach han muc bang cach huy kich hoat)", async function () {
      const f = await loadFixture(deployAll);
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.ap1).approveElection(0);
      await f.core.connect(f.ap2).approveElection(0);
      for (let i = 0; i < 3; i++) await f.core.connect(f.p1).createElection(params(f));
      await expect(f.core.connect(f.p1).updateElectionMetadata(0, ethers.id("late"))).to.be.revertedWithCustomError(f.core, "PendingLimit");
    });

    it("[14] KHOA khi Commit bat dau: khong sua duoc metadata cuoc bau cu lan ho so ung vien", async function () {
      const f = await loadFixture(deployAll);
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.ap1).approveElection(0);
      await f.core.connect(f.ap2).approveElection(0);
      const s = await f.core.getElectionStats(0);
      await time.increaseTo(BigInt(s.regEnd) + 1n);
      expect(await f.core.phase(0)).to.equal(Phase.Commit);
      await expect(f.core.connect(f.p1).updateElectionMetadata(0, ethers.id("x"))).to.be.revertedWithCustomError(f.core, "MetadataLocked");
      await expect(f.core.connect(f.p1).updateCandidateMetadata(0, 0, ethers.id("x"))).to.be.revertedWithCustomError(f.core, "MetadataLocked");
      await time.increaseTo(BigInt(s.commitEnd) + 1n);
      await expect(f.core.connect(f.p1).updateElectionMetadata(0, ethers.id("x"))).to.be.revertedWithCustomError(f.core, "MetadataLocked");
    });

    it("yeu cau bi rut / bi tu choi thi metadata dong bang (RequestClosed)", async function () {
      const f = await loadFixture(deployAll);
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.p1).withdrawElection(0);
      await f.core.connect(f.ap1).rejectElection(1);
      for (const id of [0, 1]) await expect(f.core.connect(f.p1).updateElectionMetadata(id, ethers.id("x"))).to.be.revertedWithCustomError(f.core, "RequestClosed");
    });

    it("lich su hash cu KHONG bi xoa: toan bo phien ban van doc duoc tu su kien sau khi cuoc bau cu ket thuc", async function () {
      const f = await loadFixture(deployAll);
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.p1).updateElectionMetadata(0, ethers.id("v2"));
      await f.core.connect(f.ap1).approveElection(0);
      await f.core.connect(f.ap2).approveElection(0);
      const s = await f.core.getElectionStats(0);
      await time.increaseTo(BigInt(s.revealEnd) + 1n);
      const logs = await f.core.queryFilter(f.core.filters.ElectionMetadataSet(0));
      expect(logs.length).to.equal(2);
    });
  });

  describe("D. Logic bo phieu khong bi anh huong boi metadata / to chuc", function () {
    it("[15-20] mot cuoc bau cu day du: Merkle, commit-reveal, quorum, ket qua van dung sau khi doi metadata truoc Commit", async function () {
      const f = await loadFixture(deployAll);
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.p1).updateElectionMetadata(0, ethers.id("v2"));
      await f.core.connect(f.ap1).approveElection(0);
      await f.core.connect(f.ap2).approveElection(0);
      const s = await f.core.getElectionStats(0);
      await time.increaseTo(BigInt(s.regEnd) + 1n);
      const h = (c, salt, v) => ethers.solidityPackedKeccak256(["uint256", "uint256", "string", "address"], [0, c, salt, v.address]);
      await expect(f.core.connect(f.outsider).commit(0, h(0, "x", f.outsider), [])).to.be.revertedWithCustomError(f.core, "InvalidProof");
      const picks = [0, 0, 1];
      for (let i = 0; i < 3; i++) await f.core.connect(f.voters[i]).commit(0, h(picks[i], "salt" + i, f.voters[i]), f.tree.proofs[f.voters[i].address]);
      await time.increaseTo(BigInt(s.commitEnd) + 1n);
      await expect(f.core.connect(f.v1).reveal(0, 0, "sai")).to.be.revertedWithCustomError(f.core, "BadReveal");
      for (let i = 0; i < 3; i++) await f.core.connect(f.voters[i]).reveal(0, picks[i], "salt" + i);
      await expect(f.core.connect(f.v1).reveal(0, 0, "salt0")).to.be.revertedWithCustomError(f.core, "AlreadyRevealed");
      await time.increaseTo(BigInt(s.revealEnd) + 1n);
      const r = await f.core.result(0);
      expect([r.valid, r.winnerId, r.topVotes]).to.deep.equal([true, 0n, 2n]);
    });
  });
});
