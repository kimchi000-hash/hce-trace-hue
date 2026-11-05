// test/ProjectCore.test.js
// Bo kiem thu cho contracts/project/ProjectCore.sol (Club Voting - Commit/Reveal + Merkle + Quorum).
// Tu v2: moi cuoc bau cu thuoc mot to chuc (OrganizationRegistry); nhom duyet lay tu to chuc, nguong 2/3 lam tron len.
// Kiem thu to chuc / chong spam / metadata hash nam o Organization.test.js, AntiSpam.test.js, Metadata.test.js.
// Chay:  npx hardhat test
//
// Nhom ca kiem thu:
//   A. Tao cuoc bau cu & tham so
//   B. Nguoi duyet & kich hoat
//   C. Pha Commit (nop phieu kin)
//   D. Pha Reveal (mo phieu)
//   E. Ca GIAN LAN / TAN CONG (copy-voting, replay, gia mao cu tri, bau lap...)
//   F. Ket qua: quorum, hoa phieu, bien
//   G. Moc thoi gian (bien chinh xac) & nhieu cuoc bau cu doc lap
//   H. Cay Merkle (script scripts/merkle.js khop hop dong)

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { buildTree, verifyProof } = require("../scripts/merkle");

const Phase = { Registration: 0n, Commit: 1n, Reveal: 2n, Ended: 3n };

const commitHash = (id, candidateId, salt, voter) =>
  ethers.solidityPackedKeccak256(["uint256", "uint256", "string", "address"], [id, candidateId, salt, voter]);

async function deployFixture() {
  const signers = await ethers.getSigners();
  const [creator, ap1, ap2, v1, v2, v3, v4, attacker, outsider, platform] = signers;
  const registry = await (await ethers.getContractFactory("OrganizationRegistry")).connect(platform).deploy();
  const core = await (await ethers.getContractFactory("ProjectCore")).deploy(await registry.getAddress());
  // To chuc #1: creator la Manager (chu so huu), dang ky -> platform xac minh -> 2 dai dien duyet (ap1, ap2) => nguong 2/2
  await registry.connect(creator).registerOrganization("CLB Blockchain K58", ethers.id("org-info"));
  await registry.connect(platform).verifyOrganization(1);
  for (const ap of [ap1, ap2]) {
    await registry.connect(creator).addMember(1, ap.address, 1);
    await registry.connect(creator).addApprover(1, ap.address);
  }
  const voters = [v1, v2, v3, v4];
  const tree = buildTree(voters.map((v) => v.address));
  return { core, registry, creator, ap1, ap2, v1, v2, v3, v4, voters, attacker, outsider, platform, tree, orgId: 1 };
}

const metaHashOf = (kind, i, s = "") => ethers.id(kind + ":" + i + ":" + s);

function baseParams(f, over = {}) {
  const p = {
    organizationId: f.orgId || 1,
    title: "Bau Ban can su lop K58",
    names: ["Nguyen Van A", "Tran Thi B"],
    candidateWallets: [],
    regMinutes: 5,
    commitMinutes: 10,
    revealMinutes: 10,
    quorumBps: 5000,
    voterCount: f.tree.voterCount,
    merkleRoot: f.tree.root,
    metadataHash: metaHashOf("election", 0),
    ...over,
  };
  if (!over.candidateMetadataHashes) p.candidateMetadataHashes = p.names.map((n, i) => metaHashOf("cand", i, n));
  return p;
}

/** Tao + duyet du nguong, tra ve id cuoc bau cu. */
async function createActive(f, over = {}) {
  const id = Number(await f.core.electionCount());
  await f.core.connect(f.creator).createElection(baseParams(f, over));
  await f.core.connect(f.ap1).approveElection(id);
  await f.core.connect(f.ap2).approveElection(id); // nguong 2/3 cua 2 dai dien = 2
  return id;
}

async function goTo(core, id, phaseName) {
  const s = await core.getElectionStats(id);
  const target = { Commit: s.regEnd, Reveal: s.commitEnd, Ended: s.revealEnd }[phaseName];
  await time.increaseTo(BigInt(target) + 1n);
}

describe("ProjectCore - Club Voting (Commit/Reveal + Merkle + Quorum)", function () {
  // ===================================================================== A
  describe("A. Tao cuoc bau cu", function () {
    it("tao hop le: phat su kien, tang electionCount, nguoi tao la admin, bat dau o pha Registration", async function () {
      const f = await loadFixture(deployFixture);
      await expect(f.core.connect(f.creator).createElection(baseParams(f)))
        .to.emit(f.core, "ElectionCreated")
        .withArgs(0, f.creator.address, "Bau Ban can su lop K58");
      expect(await f.core.electionCount()).to.equal(1);
      expect(await f.core.phase(0)).to.equal(Phase.Registration);
      const info = await f.core.getElectionBasicInfo(0);
      expect(info.admin).to.equal(f.creator.address);
      expect(info.isActivated).to.equal(false);
      expect(info.merkleRoot).to.equal(f.tree.root);
      expect(await f.core.getCandidates(0)).to.deep.equal(["Nguyen Van A", "Tran Thi B"]);
    });

    const bad = [
      ["tieu de rong", (f) => ({ title: "" })],
      ["tieu de qua 120 byte", (f) => ({ title: "x".repeat(121) })],
      ["chi 1 ung vien", (f) => ({ names: ["Chi mot"] })],
      ["21 ung vien (vuot MAX_CANDIDATES)", (f) => ({ names: Array.from({ length: 21 }, (_, i) => "UV" + i) })],
      ["ten ung vien rong", (f) => ({ names: ["A", ""] })],
      ["ten ung vien qua 64 byte", (f) => ({ names: ["A", "y".repeat(65)] })],
      ["regMinutes = 0", (f) => ({ regMinutes: 0 })],
      ["commitMinutes = 0", (f) => ({ commitMinutes: 0 })],
      ["revealMinutes = 0", (f) => ({ revealMinutes: 0 })],
      ["regMinutes > 30 ngay (43200 phut)", (f) => ({ regMinutes: 43201 })],
      ["commitMinutes > 30 ngay", (f) => ({ commitMinutes: 43201 })],
      ["revealMinutes > 30 ngay", (f) => ({ revealMinutes: 43201 })],
      ["thoi luong khong lo (2^255 phut) khong gay tran so, bi tu choi sach se", (f) => ({ regMinutes: 2n ** 255n })],
      ["quorumBps > 10000", (f) => ({ quorumBps: 10001 })],
      ["voterCount = 0", (f) => ({ voterCount: 0 })],
      ["merkleRoot = 0", (f) => ({ merkleRoot: ethers.ZeroHash })],
      ["regMinutes vuot han cho duyet 7 ngay (10081 phut)", (f) => ({ regMinutes: 10081 })],
      ["metadataHash = 0", (f) => ({ metadataHash: ethers.ZeroHash })],
      ["thieu hash ung vien (so hash != so ung vien)", (f) => ({ candidateMetadataHashes: [metaHashOf("cand", 0)] })],
      ["hash ung vien = 0", (f) => ({ candidateMetadataHashes: [metaHashOf("cand", 0), ethers.ZeroHash] })],
      ["khai bao nhieu vi ung vien hon so ung vien", (f) => ({ candidateWallets: [f.v1.address, f.v2.address, f.v3.address] })],
      ["voterCount vuot MAX_VOTERS (1.000.000 + 1)", () => ({ voterCount: 1_000_001 })],
      ["voterCount = 2^256-1 (se lam tran so khi tinh quorum)", () => ({ voterCount: ethers.MaxUint256 })],
    ];
    for (const [name, mk] of bad) {
      it(`tu choi InvalidParams: ${name}`, async function () {
        const f = await loadFixture(deployFixture);
        await expect(f.core.connect(f.creator).createElection(baseParams(f, mk(f)))).to.be.revertedWithCustomError(f.core, "InvalidParams");
        expect(await f.core.electionCount()).to.equal(0);
      });
    }

    it("quorumBps = 10000 (100%), 20 ung vien, cho duyet dung 7 ngay, commit/reveal dung 30 ngay: deu la bien hop le", async function () {
      const f = await loadFixture(deployFixture);
      const names = Array.from({ length: 20 }, (_, i) => "UV" + i);
      await expect(
        f.core.connect(f.creator).createElection(
          baseParams(f, { quorumBps: 10000, names, regMinutes: 10080, commitMinutes: 43200, revealMinutes: 43200, title: "t".repeat(120) })
        )
      ).to.emit(f.core, "ElectionCreated");
    });

    it("voterCount = MAX_VOTERS (1.000.000) la bien hop le va result() van doc duoc (khong tran so khi nhan quorumBps)", async function () {
      const f = await loadFixture(deployFixture);
      expect(await f.core.MAX_VOTERS()).to.equal(1_000_000);
      await f.core.connect(f.creator).createElection(baseParams(f, { voterCount: 1_000_000, quorumBps: 10000 }));
      await f.core.connect(f.ap1).approveElection(0);
      await f.core.connect(f.ap2).approveElection(0);
      await goTo(f.core, 0, "Ended");
      const r = await f.core.result(0);
      expect(r.valid).to.equal(false); // khong ai mo phieu -> khong du quorum, nhung KHONG revert
    });

    it("ElectionNotFound khi hoi cuoc bau cu khong ton tai", async function () {
      const f = await loadFixture(deployFixture);
      await expect(f.core.phase(99)).to.be.revertedWithCustomError(f.core, "ElectionNotFound");
      await expect(f.core.getCandidates(0)).to.be.revertedWithCustomError(f.core, "ElectionNotFound");
      await expect(f.core.connect(f.ap1).approveElection(0)).to.be.revertedWithCustomError(f.core, "ElectionNotFound");
    });
  });

  // ===================================================================== B
  describe("B. Nguoi duyet & kich hoat", function () {
    it("chi kich hoat khi du so chu ky (2/2), phat ElectionApproved roi ElectionActivated", async function () {
      const f = await loadFixture(deployFixture);
      await f.core.connect(f.creator).createElection(baseParams(f));

      await expect(f.core.connect(f.ap1).approveElection(0)).to.emit(f.core, "ElectionApproved").withArgs(0, f.ap1.address).and.not.to.emit(f.core, "ElectionActivated");
      expect((await f.core.getElectionBasicInfo(0)).isActivated).to.equal(false);

      await expect(f.core.connect(f.ap2).approveElection(0)).to.emit(f.core, "ElectionApproved").and.to.emit(f.core, "ElectionActivated").withArgs(0);
      expect((await f.core.getElectionBasicInfo(0)).isActivated).to.equal(true);
      expect((await f.core.getElectionStats(0)).approvalCount).to.equal(2);
    });

    it("NotApprover: nguoi la (ke ca nguoi tao) khong duoc duyet", async function () {
      const f = await loadFixture(deployFixture);
      await f.core.connect(f.creator).createElection(baseParams(f));
      await expect(f.core.connect(f.attacker).approveElection(0)).to.be.revertedWithCustomError(f.core, "NotApprover");
      await expect(f.core.connect(f.creator).approveElection(0)).to.be.revertedWithCustomError(f.core, "NotApprover");
    });

    it("AlreadyApproved: mot nguoi duyet khong duoc duyet hai lan (khong tu nang so chu ky)", async function () {
      const f = await loadFixture(deployFixture);
      await f.core.connect(f.creator).createElection(baseParams(f));
      await f.core.connect(f.ap1).approveElection(0);
      await expect(f.core.connect(f.ap1).approveElection(0)).to.be.revertedWithCustomError(f.core, "AlreadyApproved");
      expect((await f.core.getElectionBasicInfo(0)).isActivated).to.equal(false);
    });

    it("WrongPhase: het han Registration thi khong duyet duoc nua -> cuoc bau cu khong bao gio kich hoat", async function () {
      const f = await loadFixture(deployFixture);
      await f.core.connect(f.creator).createElection(baseParams(f));
      await goTo(f.core, 0, "Commit");
      await expect(f.core.connect(f.ap1).approveElection(0)).to.be.revertedWithCustomError(f.core, "WrongPhase").withArgs(Phase.Commit);
      // ... va vi chua kich hoat nen cu tri khong the nop phieu
      await expect(f.core.connect(f.v1).commit(0, commitHash(0, 0, "s", f.v1.address), f.tree.proofs[f.v1.address])).to.be.revertedWithCustomError(f.core, "ElectionNotActive");
    });

    it("getApprovers tra dung danh sach", async function () {
      const f = await loadFixture(deployFixture);
      await f.core.connect(f.creator).createElection(baseParams(f));
      expect(await f.core.getApprovers(0)).to.deep.equal([f.ap1.address, f.ap2.address]);
      expect(await f.core.isApprover(0, f.ap2.address)).to.equal(true);
      expect(await f.core.isApprover(0, f.attacker.address)).to.equal(false);
    });
  });

  // ===================================================================== C
  describe("C. Pha Commit (nop phieu kin)", function () {
    it("cu tri hop le nop commitment: phat Committed, luu hash, getVoterStatus dung", async function () {
      const f = await loadFixture(deployFixture);
      const id = await createActive(f);
      await goTo(f.core, id, "Commit");
      const h = commitHash(id, 1, "muoi-bi-mat", f.v1.address);
      await expect(f.core.connect(f.v1).commit(id, h, f.tree.proofs[f.v1.address])).to.emit(f.core, "Committed").withArgs(id, f.v1.address);
      expect(await f.core.commitments(id, f.v1.address)).to.equal(h);
      const st = await f.core.getVoterStatus(id, f.v1.address);
      expect([st.committed, st.revealed]).to.deep.equal([true, false]);
    });

    it("WrongPhase(Registration): nop phieu qua som", async function () {
      const f = await loadFixture(deployFixture);
      const id = await createActive(f);
      await expect(f.core.connect(f.v1).commit(id, commitHash(id, 0, "s", f.v1.address), f.tree.proofs[f.v1.address]))
        .to.be.revertedWithCustomError(f.core, "WrongPhase").withArgs(Phase.Registration);
    });

    it("WrongPhase(Reveal): nop phieu qua tre", async function () {
      const f = await loadFixture(deployFixture);
      const id = await createActive(f);
      await goTo(f.core, id, "Reveal");
      await expect(f.core.connect(f.v1).commit(id, commitHash(id, 0, "s", f.v1.address), f.tree.proofs[f.v1.address]))
        .to.be.revertedWithCustomError(f.core, "WrongPhase").withArgs(Phase.Reveal);
    });

    it("ElectionNotActive: chua du chu ky duyet thi chua duoc nop phieu", async function () {
      const f = await loadFixture(deployFixture);
      await f.core.connect(f.creator).createElection(baseParams(f, { regMinutes: 1 }));
      await f.core.connect(f.ap1).approveElection(0); // moi 1/2
      await goTo(f.core, 0, "Commit");
      await expect(f.core.connect(f.v1).commit(0, commitHash(0, 0, "s", f.v1.address), f.tree.proofs[f.v1.address])).to.be.revertedWithCustomError(f.core, "ElectionNotActive");
    });

    it("AlreadyCommitted: khong nop phieu lan hai, hash cu giu nguyen", async function () {
      const f = await loadFixture(deployFixture);
      const id = await createActive(f);
      await goTo(f.core, id, "Commit");
      const h1 = commitHash(id, 0, "a", f.v1.address);
      await f.core.connect(f.v1).commit(id, h1, f.tree.proofs[f.v1.address]);
      await expect(f.core.connect(f.v1).commit(id, commitHash(id, 1, "b", f.v1.address), f.tree.proofs[f.v1.address])).to.be.revertedWithCustomError(f.core, "AlreadyCommitted");
      expect(await f.core.commitments(id, f.v1.address)).to.equal(h1);
    });

    it("InvalidParams: commitment = 0x0", async function () {
      const f = await loadFixture(deployFixture);
      const id = await createActive(f);
      await goTo(f.core, id, "Commit");
      await expect(f.core.connect(f.v1).commit(id, ethers.ZeroHash, f.tree.proofs[f.v1.address])).to.be.revertedWithCustomError(f.core, "InvalidParams");
    });

    it("InvalidParams: khong cho nop gia tri danh dau 'da mo phieu' (0xff..ff) lam commitment gia", async function () {
      const f = await loadFixture(deployFixture);
      const id = await createActive(f);
      await goTo(f.core, id, "Commit");
      const sentinel = ethers.toBeHex(ethers.MaxUint256, 32);
      await expect(f.core.connect(f.v1).commit(id, sentinel, f.tree.proofs[f.v1.address])).to.be.revertedWithCustomError(f.core, "InvalidParams");
      expect((await f.core.getVoterStatus(id, f.v1.address)).revealed).to.equal(false);
    });
  });

  // ===================================================================== D
  describe("D. Pha Reveal (mo phieu)", function () {
    async function committed(f, choices) {
      // choices: [[voter, candidateId, salt], ...]
      const id = await createActive(f, { names: ["A", "B", "C"] });
      await goTo(f.core, id, "Commit");
      for (const [v, cid, salt] of choices) {
        await f.core.connect(v).commit(id, commitHash(id, cid, salt, v.address), f.tree.proofs[v.address]);
      }
      await goTo(f.core, id, "Reveal");
      return id;
    }

    it("mo phieu hop le: tang votes & revealedCount, phat Revealed, danh dau da mo", async function () {
      const f = await loadFixture(deployFixture);
      const id = await committed(f, [[f.v1, 2, "salt-v1"]]);
      await expect(f.core.connect(f.v1).reveal(id, 2, "salt-v1")).to.emit(f.core, "Revealed").withArgs(id, f.v1.address, 2);
      expect((await f.core.getVotes(id)).map(Number)).to.deep.equal([0, 0, 1]);
      expect((await f.core.getElectionStats(id)).revealedCount).to.equal(1);
      const st = await f.core.getVoterStatus(id, f.v1.address);
      expect([st.committed, st.revealed]).to.deep.equal([true, true]);
    });

    it("hasRevealed(): false truoc khi mo, true sau khi mo; chi dung cho dung cu tri", async function () {
      const f = await loadFixture(deployFixture);
      const id = await committed(f, [[f.v1, 0, "a"], [f.v2, 1, "b"]]);
      expect(await f.core.hasRevealed(id, f.v1.address)).to.equal(false);
      await f.core.connect(f.v1).reveal(id, 0, "a");
      expect(await f.core.hasRevealed(id, f.v1.address)).to.equal(true);
      expect(await f.core.hasRevealed(id, f.v2.address)).to.equal(false); // v2 commit nhung chua mo
      expect(await f.core.hasRevealed(id, f.v3.address)).to.equal(false); // v3 chua tung nop
    });

    it("NoCommitment: chua tung nop phieu thi khong mo duoc", async function () {
      const f = await loadFixture(deployFixture);
      const id = await committed(f, [[f.v1, 0, "s"]]);
      await expect(f.core.connect(f.v2).reveal(id, 0, "s")).to.be.revertedWithCustomError(f.core, "NoCommitment");
    });

    it("BadReveal: sai salt", async function () {
      const f = await loadFixture(deployFixture);
      const id = await committed(f, [[f.v1, 0, "dung"]]);
      await expect(f.core.connect(f.v1).reveal(id, 0, "sai")).to.be.revertedWithCustomError(f.core, "BadReveal");
    });

    it("BadReveal: doi ung vien so voi luc cam ket (khong the 'doi y' sau khi nop)", async function () {
      const f = await loadFixture(deployFixture);
      const id = await committed(f, [[f.v1, 0, "s"]]);
      await expect(f.core.connect(f.v1).reveal(id, 1, "s")).to.be.revertedWithCustomError(f.core, "BadReveal");
      expect((await f.core.getVotes(id)).map(Number)).to.deep.equal([0, 0, 0]);
    });

    it("AlreadyRevealed: mo phieu lan hai khong cong them phieu", async function () {
      const f = await loadFixture(deployFixture);
      const id = await committed(f, [[f.v1, 0, "s"]]);
      await f.core.connect(f.v1).reveal(id, 0, "s");
      await expect(f.core.connect(f.v1).reveal(id, 0, "s")).to.be.revertedWithCustomError(f.core, "AlreadyRevealed");
      expect((await f.core.getVotes(id)).map(Number)).to.deep.equal([1, 0, 0]);
      expect((await f.core.getElectionStats(id)).revealedCount).to.equal(1);
    });

    it("InvalidCandidate: ung vien khong ton tai", async function () {
      const f = await loadFixture(deployFixture);
      const id = await committed(f, [[f.v1, 7, "s"]]); // cu tri tu y cam ket vao ung vien 7 (khong co)
      await expect(f.core.connect(f.v1).reveal(id, 7, "s")).to.be.revertedWithCustomError(f.core, "InvalidCandidate");
    });

    it("WrongPhase(Commit): khong mo phieu truoc khi het pha Commit", async function () {
      const f = await loadFixture(deployFixture);
      const id = await createActive(f);
      await goTo(f.core, id, "Commit");
      await f.core.connect(f.v1).commit(id, commitHash(id, 0, "s", f.v1.address), f.tree.proofs[f.v1.address]);
      await expect(f.core.connect(f.v1).reveal(id, 0, "s")).to.be.revertedWithCustomError(f.core, "WrongPhase").withArgs(Phase.Commit);
    });

    it("WrongPhase(Ended): khong mo phieu sau khi het han -> phieu tre khong duoc tinh", async function () {
      const f = await loadFixture(deployFixture);
      const id = await committed(f, [[f.v1, 0, "s"]]);
      await goTo(f.core, id, "Ended");
      await expect(f.core.connect(f.v1).reveal(id, 0, "s")).to.be.revertedWithCustomError(f.core, "WrongPhase").withArgs(Phase.Ended);
    });
  });

  // ===================================================================== E
  describe("E. Ca GIAN LAN / TAN CONG", function () {
    it("[Gia mao cu tri] vi khong co trong danh sach Merkle -> InvalidProof (proof cua nguoi khac khong dung duoc)", async function () {
      const f = await loadFixture(deployFixture);
      const id = await createActive(f);
      await goTo(f.core, id, "Commit");
      const h = commitHash(id, 0, "s", f.attacker.address);
      await expect(f.core.connect(f.attacker).commit(id, h, f.tree.proofs[f.v1.address])).to.be.revertedWithCustomError(f.core, "InvalidProof"); // an cap proof cua v1
      await expect(f.core.connect(f.attacker).commit(id, h, [])).to.be.revertedWithCustomError(f.core, "InvalidProof"); // proof rong
      await expect(f.core.connect(f.outsider).commit(id, h, [ethers.ZeroHash])).to.be.revertedWithCustomError(f.core, "InvalidProof"); // proof rac
    });

    it("[Copy-voting] cu tri chep hash cua nguoi khac de 'bau theo' -> khong mo duoc phieu (BadReveal)", async function () {
      const f = await loadFixture(deployFixture);
      const id = await createActive(f, { names: ["A", "B"] });
      await goTo(f.core, id, "Commit");
      const victimHash = commitHash(id, 0, "salt-nan-nhan", f.v1.address);
      await f.core.connect(f.v1).commit(id, victimHash, f.tree.proofs[f.v1.address]);
      // v2 (cu tri hop le) thay hash cua v1 tren chuoi va nop y het
      await f.core.connect(f.v2).commit(id, victimHash, f.tree.proofs[f.v2.address]);
      await goTo(f.core, id, "Reveal");
      // v2 khong biet salt that -> khong mo duoc; ngay ca khi biet salt cung vo ich vi hash gan voi dia chi
      await expect(f.core.connect(f.v2).reveal(id, 0, "salt-nan-nhan")).to.be.revertedWithCustomError(f.core, "BadReveal");
      await expect(f.core.connect(f.v2).reveal(id, 0, "doan-bua")).to.be.revertedWithCustomError(f.core, "BadReveal");
      await f.core.connect(f.v1).reveal(id, 0, "salt-nan-nhan");
      expect((await f.core.getVotes(id)).map(Number)).to.deep.equal([1, 0]); // chi 1 phieu cua v1
      expect((await f.core.getElectionStats(id)).revealedCount).to.equal(1);
    });

    it("[Replay giua cac cuoc bau cu] hash cua cuoc 0 khong dung duoc o cuoc 1 (vi hash gan voi id)", async function () {
      const f = await loadFixture(deployFixture);
      const id0 = await createActive(f);
      const id1 = await createActive(f);
      await goTo(f.core, id0, "Commit");
      await goTo(f.core, id1, "Commit");
      const hashFor0 = commitHash(id0, 0, "s", f.v1.address);
      await f.core.connect(f.v1).commit(id0, hashFor0, f.tree.proofs[f.v1.address]);
      await f.core.connect(f.v1).commit(id1, hashFor0, f.tree.proofs[f.v1.address]); // nop nham hash cua cuoc 0 vao cuoc 1
      await goTo(f.core, id1, "Reveal");
      await expect(f.core.connect(f.v1).reveal(id1, 0, "s")).to.be.revertedWithCustomError(f.core, "BadReveal");
    });

    it("[Bau lap] cu tri khong the tang phieu bang cach commit/reveal nhieu lan", async function () {
      const f = await loadFixture(deployFixture);
      const id = await createActive(f);
      await goTo(f.core, id, "Commit");
      await f.core.connect(f.v1).commit(id, commitHash(id, 0, "s", f.v1.address), f.tree.proofs[f.v1.address]);
      await expect(f.core.connect(f.v1).commit(id, commitHash(id, 0, "s2", f.v1.address), f.tree.proofs[f.v1.address])).to.be.revertedWithCustomError(f.core, "AlreadyCommitted");
      await goTo(f.core, id, "Reveal");
      await f.core.connect(f.v1).reveal(id, 0, "s");
      await expect(f.core.connect(f.v1).reveal(id, 0, "s")).to.be.revertedWithCustomError(f.core, "AlreadyRevealed");
      expect((await f.core.getVotes(id)).map(Number)).to.deep.equal([1, 0]);
    });

    it("[Nguoi ngoai to chuc] nguoi khong thuoc to chuc khong the tao cuoc bau cu cho to chuc do", async function () {
      const f = await loadFixture(deployFixture);
      await expect(f.core.connect(f.attacker).createElection(baseParams(f))).to.be.revertedWithCustomError(f.core, "NotAuthorized");
      expect(await f.core.electionCount()).to.equal(0);
    });

    it("[Doc ket qua som] result() bi chan cho den khi het pha Reveal", async function () {
      const f = await loadFixture(deployFixture);
      const id = await createActive(f);
      await goTo(f.core, id, "Reveal");
      await expect(f.core.result(id)).to.be.revertedWithCustomError(f.core, "WrongPhase").withArgs(Phase.Reveal);
    });
  });

  // ===================================================================== F
  describe("F. Ket qua: quorum, hoa phieu, bien", function () {
    async function runElection(f, choices, over = {}) {
      const id = await createActive(f, { names: ["A", "B", "C"], ...over });
      await goTo(f.core, id, "Commit");
      for (const [v, cid, salt] of choices) await f.core.connect(v).commit(id, commitHash(id, cid, salt, v.address), f.tree.proofs[v.address]);
      await goTo(f.core, id, "Reveal");
      for (const [v, cid, salt, doReveal] of choices) if (doReveal !== false) await f.core.connect(v).reveal(id, cid, salt);
      await goTo(f.core, id, "Ended");
      return id;
    }

    it("thang hop le: 3 phieu A, 1 phieu B (quorum 50%) -> valid, winner = A", async function () {
      const f = await loadFixture(deployFixture);
      const id = await runElection(f, [[f.v1, 0, "1"], [f.v2, 0, "2"], [f.v3, 0, "3"], [f.v4, 1, "4"]]);
      const r = await f.core.result(id);
      expect([r.valid, r.winnerId, r.topVotes]).to.deep.equal([true, 0n, 3n]);
    });

    it("quorum dung bang nguong (2/4 = 50.00%) van hop le", async function () {
      const f = await loadFixture(deployFixture);
      const id = await runElection(f, [[f.v1, 2, "1"], [f.v2, 2, "2"]]);
      const r = await f.core.result(id);
      expect([r.valid, r.winnerId, r.topVotes]).to.deep.equal([true, 2n, 2n]);
    });

    it("khong du quorum (1/4 = 25% < 50%) -> valid = false, tra ve (false,0,0)", async function () {
      const f = await loadFixture(deployFixture);
      const id = await runElection(f, [[f.v1, 1, "1"]]);
      const r = await f.core.result(id);
      expect([r.valid, r.winnerId, r.topVotes]).to.deep.equal([false, 0n, 0n]);
    });

    it("cam ket nhung khong mo phieu: khong duoc tinh vao quorum (3 commit, 1 reveal -> 25% < 50%)", async function () {
      const f = await loadFixture(deployFixture);
      const id = await runElection(f, [[f.v1, 0, "1"], [f.v2, 0, "2", false], [f.v3, 0, "3", false]]);
      expect((await f.core.getElectionStats(id)).revealedCount).to.equal(1);
      expect((await f.core.result(id)).valid).to.equal(false);
    });

    it("hoa phieu 1-1 (du quorum) -> valid = false", async function () {
      const f = await loadFixture(deployFixture);
      const id = await runElection(f, [[f.v1, 0, "1"], [f.v2, 1, "2"]]);
      const r = await f.core.result(id);
      expect(r.valid).to.equal(false);
    });

    it("hoa 3 nguoi 1-1-1 -> valid = false", async function () {
      const f = await loadFixture(deployFixture);
      const id = await runElection(f, [[f.v1, 0, "1"], [f.v2, 1, "2"], [f.v3, 2, "3"]]);
      expect((await f.core.result(id)).valid).to.equal(false);
    });

    it("khong ai mo phieu, quorumBps = 0 -> van valid = false (khong co nguoi dan dau)", async function () {
      const f = await loadFixture(deployFixture);
      const id = await runElection(f, [], { quorumBps: 0 });
      expect((await f.core.result(id)).valid).to.equal(false);
    });

    it("quorum 100%: thieu mot nguoi la that bai, du ca 4 nguoi thi hop le", async function () {
      const f = await loadFixture(deployFixture);
      const a = await runElection(f, [[f.v1, 0, "1"], [f.v2, 0, "2"], [f.v3, 0, "3"]], { quorumBps: 10000 });
      expect((await f.core.result(a)).valid).to.equal(false);
      const b = await runElection(f, [[f.v1, 0, "1"], [f.v2, 0, "2"], [f.v3, 0, "3"], [f.v4, 1, "4"]], { quorumBps: 10000 });
      expect((await f.core.result(b)).valid).to.equal(true);
    });

    it("nguoi dan dau o vi tri cuoi mang (id 2) van duoc xac dinh dung", async function () {
      const f = await loadFixture(deployFixture);
      const id = await runElection(f, [[f.v1, 2, "1"], [f.v2, 2, "2"], [f.v3, 1, "3"]]);
      const r = await f.core.result(id);
      expect([r.valid, r.winnerId, r.topVotes]).to.deep.equal([true, 2n, 2n]);
    });
  });

  // ===================================================================== G
  describe("G. Moc thoi gian & nhieu cuoc bau cu doc lap", function () {
    it("bien chinh xac: duyet DUOC o giay regEnd, KHONG duoc o regEnd + 1", async function () {
      const f = await loadFixture(deployFixture);
      await f.core.connect(f.creator).createElection(baseParams(f));
      const { regEnd } = await f.core.getElectionStats(0);
      await time.setNextBlockTimestamp(regEnd);
      await expect(f.core.connect(f.ap1).approveElection(0)).to.emit(f.core, "ElectionApproved");
      await time.setNextBlockTimestamp(regEnd + 1n);
      await expect(f.core.connect(f.ap2).approveElection(0)).to.be.revertedWithCustomError(f.core, "WrongPhase");
    });

    it("bien chinh xac: nop phieu DUOC o giay commitEnd, KHONG duoc o commitEnd + 1", async function () {
      const f = await loadFixture(deployFixture);
      const id = await createActive(f);
      const { regEnd, commitEnd } = await f.core.getElectionStats(id);
      await time.increaseTo(regEnd + 1n);
      await time.setNextBlockTimestamp(commitEnd);
      await f.core.connect(f.v1).commit(id, commitHash(id, 0, "s", f.v1.address), f.tree.proofs[f.v1.address]);
      await time.setNextBlockTimestamp(commitEnd + 1n);
      await expect(f.core.connect(f.v2).commit(id, commitHash(id, 0, "s", f.v2.address), f.tree.proofs[f.v2.address])).to.be.revertedWithCustomError(f.core, "WrongPhase");
    });

    it("cac moc thoi gian cong don dung: regEnd < commitEnd < revealEnd", async function () {
      const f = await loadFixture(deployFixture);
      await f.core.connect(f.creator).createElection(baseParams(f, { regMinutes: 5, commitMinutes: 10, revealMinutes: 20 }));
      const s = await f.core.getElectionStats(0);
      expect(s.commitEnd - s.regEnd).to.equal(10n * 60n);
      expect(s.revealEnd - s.commitEnd).to.equal(20n * 60n);
    });

    it("hai cuoc bau cu doc lap: phieu va ket qua khong tron lan", async function () {
      const f = await loadFixture(deployFixture);
      const a = await createActive(f, { names: ["A", "B"] });
      const b = await createActive(f, { names: ["X", "Y", "Z"] });
      await goTo(f.core, a, "Commit");
      await goTo(f.core, b, "Commit");
      await f.core.connect(f.v1).commit(a, commitHash(a, 1, "sa", f.v1.address), f.tree.proofs[f.v1.address]);
      await f.core.connect(f.v1).commit(b, commitHash(b, 2, "sb", f.v1.address), f.tree.proofs[f.v1.address]); // cung cu tri duoc bau o ca hai cuoc
      await goTo(f.core, a, "Reveal");
      await goTo(f.core, b, "Reveal");
      await f.core.connect(f.v1).reveal(a, 1, "sa");
      await f.core.connect(f.v1).reveal(b, 2, "sb");
      expect((await f.core.getVotes(a)).map(Number)).to.deep.equal([0, 1]);
      expect((await f.core.getVotes(b)).map(Number)).to.deep.equal([0, 0, 1]);
    });
  });

  // ===================================================================== H
  describe("H. Cay Merkle (scripts/merkle.js khop hop dong)", function () {
    it("moi dia chi o moi kich co cay 1..40 deu co proof hop le (ke ca so le)", function () {
      for (let n = 1; n <= 40; n++) {
        const addrs = Array.from({ length: n }, () => ethers.Wallet.createRandom().address);
        const t = buildTree(addrs);
        for (const a of addrs) expect(verifyProof(t.proofs[a], t.root, a), `n=${n}`).to.equal(true);
        const stranger = ethers.Wallet.createRandom().address;
        expect(verifyProof(t.proofs[addrs[0]], t.root, stranger)).to.equal(false);
      }
    });

    it("hop dong chap nhan proof cua cu tri o cay 5 nguoi (so le) va cay 1 nguoi", async function () {
      const f = await loadFixture(deployFixture);
      const signers = await ethers.getSigners();
      for (const group of [signers.slice(3, 8), [signers[3]]]) {
        const tree = buildTree(group.map((s) => s.address));
        const id = Number(await f.core.electionCount());
        await f.core.connect(f.creator).createElection(baseParams(f, { merkleRoot: tree.root, voterCount: tree.voterCount }));
        await f.core.connect(f.ap1).approveElection(id);
        await f.core.connect(f.ap2).approveElection(id);
        await goTo(f.core, id, "Commit");
        for (const s of group) {
          await expect(f.core.connect(s).commit(id, commitHash(id, 0, "s", s.address), tree.proofs[s.address])).to.emit(f.core, "Committed");
        }
      }
    });

    it("buildTree tu choi danh sach rong, dia chi trung, dia chi 0x0, dia chi sai", function () {
      const a = ethers.Wallet.createRandom().address;
      expect(() => buildTree([])).to.throw();
      expect(() => buildTree([a, a])).to.throw(/trung/);
      expect(() => buildTree([ethers.ZeroAddress])).to.throw();
      expect(() => buildTree(["0x123"])).to.throw();
    });
  });
});
