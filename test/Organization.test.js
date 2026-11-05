// Kiem thu OrganizationRegistry + tich hop voi ProjectCore (to chuc, thanh vien, dai dien, nguong 2/3, xung dot loi ich).
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { Role, Status, Req, deployAll, params } = require("./helpers");

describe("OrganizationRegistry + tich hop ProjectCore", function () {
  // ===================================================================== A
  describe("A. Dang ky & xac minh to chuc", function () {
    it("[1] dang ky to chuc: phat su kien, Pending, nguoi dang ky la Manager va la chu so huu", async function () {
      const f = await loadFixture(deployAll);
      await expect(f.registry.connect(f.outsider).registerOrganization("Hoi SV Khoa Kinh te", ethers.id("i")))
        .to.emit(f.registry, "OrganizationRegistered").withArgs(2, f.outsider.address, "Hoi SV Khoa Kinh te");
      const o = await f.registry.getOrganization(2);
      expect(o.owner).to.equal(f.outsider.address);
      expect(o.status).to.equal(Status.Pending);
      expect(o.name).to.equal("Hoi SV Khoa Kinh te");
      expect(await f.registry.roleOf(2, f.outsider.address)).to.equal(Role.Manager);
      expect(o.memberCount).to.equal(1);
    });

    it("ten rong / qua 64 byte bi tu choi; to chuc khong ton tai -> OrganizationNotFound", async function () {
      const f = await loadFixture(deployAll);
      await expect(f.registry.registerOrganization("", ethers.ZeroHash)).to.be.revertedWithCustomError(f.registry, "InvalidParams");
      await expect(f.registry.registerOrganization("x".repeat(65), ethers.ZeroHash)).to.be.revertedWithCustomError(f.registry, "InvalidParams");
      await expect(f.registry.getOrganization(0)).to.be.revertedWithCustomError(f.registry, "OrganizationNotFound");
      await expect(f.registry.getOrganization(99)).to.be.revertedWithCustomError(f.registry, "OrganizationNotFound");
    });

    it("[2] to chuc CHUA xac minh khong the tao cuoc bau cu va khong quan ly duoc thanh vien", async function () {
      const f = await loadFixture(deployAll);
      await f.registry.connect(f.outsider).registerOrganization("Chua xac minh", ethers.ZeroHash);
      await expect(f.core.connect(f.outsider).createElection(params(f, { organizationId: 2 }))).to.be.revertedWithCustomError(f.core, "OrganizationNotVerified");
      await expect(f.registry.connect(f.outsider).addMember(2, f.v1.address, Role.Member)).to.be.revertedWithCustomError(f.registry, "OrganizationNotVerified");
      expect(await f.registry.isVerified(2)).to.equal(false);
    });

    it("chi quan tri vien nen tang moi xac minh / dinh chi; nguoi khac (ke ca chu to chuc) bi chan", async function () {
      const f = await loadFixture(deployAll);
      await f.registry.connect(f.outsider).registerOrganization("X", ethers.ZeroHash);
      await expect(f.registry.connect(f.outsider).verifyOrganization(2)).to.be.revertedWithCustomError(f.registry, "NotPlatformAdmin");
      await expect(f.registry.connect(f.owner).suspendOrganization(1)).to.be.revertedWithCustomError(f.registry, "NotPlatformAdmin");
      await expect(f.registry.connect(f.platform).verifyOrganization(2)).to.emit(f.registry, "OrganizationVerified").withArgs(2, f.platform.address);
      await expect(f.registry.connect(f.platform).verifyOrganization(2)).to.be.revertedWithCustomError(f.registry, "InvalidStatus");
    });

    it("quan tri vien nen tang KHONG duoc can thiep noi bo: khong them/xoa thanh vien, khong chon dai dien, khong sua to chuc", async function () {
      const f = await loadFixture(deployAll);
      const r = f.registry.connect(f.platform);
      await expect(r.addMember(1, f.v1.address, Role.Member)).to.be.revertedWithCustomError(f.registry, "NotManager");
      await expect(r.removeMember(1, f.ap1.address)).to.be.revertedWithCustomError(f.registry, "NotManager");
      await expect(r.updateMemberRole(1, f.ap1.address, Role.Manager)).to.be.revertedWithCustomError(f.registry, "NotManager");
      await expect(r.addApprover(1, f.p1.address)).to.be.revertedWithCustomError(f.registry, "NotManager");
      await expect(r.replaceApprover(1, f.ap1.address, f.p1.address)).to.be.revertedWithCustomError(f.registry, "NotManager");
      await expect(r.updateOrganization(1, "Doi ten", ethers.ZeroHash)).to.be.revertedWithCustomError(f.registry, "NotManager");
    });

    it("chuyen giao quan tri vien nen tang: chi quan tri hien tai, khong cho address(0)", async function () {
      const f = await loadFixture(deployAll);
      await expect(f.registry.connect(f.owner).transferPlatformAdmin(f.owner.address)).to.be.revertedWithCustomError(f.registry, "NotPlatformAdmin");
      await expect(f.registry.connect(f.platform).transferPlatformAdmin(ethers.ZeroAddress)).to.be.revertedWithCustomError(f.registry, "InvalidParams");
      await f.registry.connect(f.platform).transferPlatformAdmin(f.outsider.address);
      expect(await f.registry.platformAdmin()).to.equal(f.outsider.address);
      await expect(f.registry.connect(f.platform).verifyOrganization(1)).to.be.revertedWithCustomError(f.registry, "NotPlatformAdmin");
    });

    it("dinh chi: khong tao duoc cuoc moi, cuoc dang chay van bo phieu binh thuong; xac minh lai thi tao duoc", async function () {
      const f = await loadFixture(deployAll);
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.ap1).approveElection(0);
      await f.core.connect(f.ap2).approveElection(0);
      await expect(f.registry.connect(f.platform).suspendOrganization(1)).to.emit(f.registry, "OrganizationSuspended");
      await expect(f.core.connect(f.p1).createElection(params(f))).to.be.revertedWithCustomError(f.core, "OrganizationNotVerified");
      await expect(f.registry.connect(f.owner).addMember(1, f.v1.address, Role.Member)).to.be.revertedWithCustomError(f.registry, "OrganizationNotVerified");
      // cuoc bau cu da kich hoat van chay
      const s = await f.core.getElectionStats(0);
      await time.increaseTo(BigInt(s.regEnd) + 1n);
      await f.core.connect(f.v1).commit(0, ethers.id("c"), f.tree.proofs[f.v1.address]);
      await f.registry.connect(f.platform).verifyOrganization(1);
      await expect(f.core.connect(f.p1).createElection(params(f))).to.emit(f.core, "ElectionCreated");
    });
  });

  // ===================================================================== B
  describe("B. Thanh vien & phan quyen", function () {
    it("[3] to chuc da xac minh: Manager them / doi vai tro / go thanh vien, moi thao tac deu co su kien", async function () {
      const f = await loadFixture(deployAll);
      const r = f.registry.connect(f.owner);
      await expect(r.addMember(1, f.v1.address, Role.Member)).to.emit(f.registry, "MemberAdded").withArgs(1, f.v1.address, Role.Member);
      await expect(r.updateMemberRole(1, f.v1.address, Role.Proposer)).to.emit(f.registry, "MemberRoleUpdated").withArgs(1, f.v1.address, Role.Proposer);
      expect(await f.registry.canPropose(1, f.v1.address)).to.equal(true);
      await expect(r.removeMember(1, f.v1.address)).to.emit(f.registry, "MemberRemoved").withArgs(1, f.v1.address);
      expect(await f.registry.roleOf(1, f.v1.address)).to.equal(Role.None);
      expect(await f.registry.canPropose(1, f.v1.address)).to.equal(false);
    });

    it("getMembers phan anh dung danh sach sau nhieu lan them / go (hoan vi swap-and-pop)", async function () {
      const f = await loadFixture(deployAll);
      const before = (await f.registry.getMembers(1)).addrs.length;
      await f.registry.connect(f.owner).addMember(1, f.v1.address, Role.Member);
      await f.registry.connect(f.owner).addMember(1, f.v2.address, Role.Member);
      await f.registry.connect(f.owner).removeMember(1, f.p2.address);
      const m = await f.registry.getMembers(1);
      expect(m.addrs.length).to.equal(before + 1);
      expect(m.addrs).to.not.include(f.p2.address);
      expect(m.addrs).to.include.members([f.v1.address, f.v2.address, f.p1.address]);
      for (let i = 0; i < m.addrs.length; i++) expect(m.roles[i]).to.equal(await f.registry.roleOf(1, m.addrs[i]));
    });

    it("chi Manager cua DUNG to chuc moi quan ly: Proposer, Member, nguoi ngoai va Manager to chuc khac deu bi chan", async function () {
      const f = await loadFixture(deployAll);
      await f.registry.connect(f.outsider).registerOrganization("To chuc khac", ethers.ZeroHash);
      await f.registry.connect(f.platform).verifyOrganization(2);
      for (const who of [f.p1, f.ap1, f.v1, f.outsider]) {
        await expect(f.registry.connect(who).addMember(1, f.v3.address, Role.Member)).to.be.revertedWithCustomError(f.registry, "NotManager");
        await expect(f.registry.connect(who).addApprover(1, f.p2.address)).to.be.revertedWithCustomError(f.registry, "NotManager");
      }
      // Manager to chuc #2 van khong dong vao duoc to chuc #1
      await expect(f.registry.connect(f.outsider).addMember(1, f.v3.address, Role.Member)).to.be.revertedWithCustomError(f.registry, "NotManager");
    });

    it("khong them trung, khong role None / address(0); khong doi vai tro / go nguoi khong la thanh vien", async function () {
      const f = await loadFixture(deployAll);
      const r = f.registry.connect(f.owner);
      await expect(r.addMember(1, f.ap1.address, Role.Member)).to.be.revertedWithCustomError(f.registry, "AlreadyMember");
      await expect(r.addMember(1, ethers.ZeroAddress, Role.Member)).to.be.revertedWithCustomError(f.registry, "InvalidParams");
      await expect(r.addMember(1, f.v1.address, Role.None)).to.be.revertedWithCustomError(f.registry, "InvalidParams");
      await expect(r.removeMember(1, f.v1.address)).to.be.revertedWithCustomError(f.registry, "NotMember");
      await expect(r.updateMemberRole(1, f.v1.address, Role.Member)).to.be.revertedWithCustomError(f.registry, "NotMember");
    });

    it("chu so huu khong bi go / ha quyen; thanh vien dang la dai dien phai bi go quyen dai dien truoc", async function () {
      const f = await loadFixture(deployAll);
      const r = f.registry.connect(f.owner);
      await expect(r.removeMember(1, f.owner.address)).to.be.revertedWithCustomError(f.registry, "CannotChangeOwner");
      await expect(r.updateMemberRole(1, f.owner.address, Role.Member)).to.be.revertedWithCustomError(f.registry, "CannotChangeOwner");
      await expect(r.removeMember(1, f.ap1.address)).to.be.revertedWithCustomError(f.registry, "IsApprover");
    });

    it("[4] chi Proposer / Manager tao duoc cuoc bau cu: nguoi ngoai va Member thuong bi NotAuthorized", async function () {
      const f = await loadFixture(deployAll);
      await expect(f.core.connect(f.outsider).createElection(params(f))).to.be.revertedWithCustomError(f.core, "NotAuthorized");
      await expect(f.core.connect(f.ap1).createElection(params(f))).to.be.revertedWithCustomError(f.core, "NotAuthorized"); // Member
      await expect(f.core.connect(f.p1).createElection(params(f))).to.emit(f.core, "ElectionProposed");
      await expect(f.core.connect(f.owner).createElection(params(f))).to.emit(f.core, "ElectionProposed"); // Manager
    });

    it("bi go khoi to chuc thi mat quyen tao cuoc bau cu ngay lap tuc", async function () {
      const f = await loadFixture(deployAll);
      await f.registry.connect(f.owner).removeMember(1, f.p1.address);
      await expect(f.core.connect(f.p1).createElection(params(f))).to.be.revertedWithCustomError(f.core, "NotAuthorized");
    });

    it("cuoc bau cu ghi nhan to chuc, nguoi tao va thoi diem tao", async function () {
      const f = await loadFixture(deployAll);
      await f.core.connect(f.p1).createElection(params(f));
      const o = await f.core.getElectionOrg(0);
      expect(o.organizationId).to.equal(1);
      expect(o.createdAt).to.equal(BigInt(await time.latest()));
      expect((await f.core.getElectionBasicInfo(0)).admin).to.equal(f.p1.address);
    });
  });

  // ===================================================================== C
  describe("C. Dai dien phe duyet va nguong 2/3", function () {
    it("[5] nguong = 2/3 so dai dien, lam tron len (2->2, 3->2, 4->3, 5->4, 6->4, 7->5, 10->7)", async function () {
      const f = await loadFixture(deployAll);
      const want = { 2: 2, 3: 2, 4: 3, 5: 4, 6: 4, 7: 5, 8: 6, 9: 6, 10: 7 };
      for (const [n, t] of Object.entries(want)) expect(await f.registry.approvalThreshold(n)).to.equal(t);
    });

    it("[5] cac to chuc co so dai dien khac nhau -> cuoc bau cu nhan so chu ky can thiet khac nhau (khong co nhom co dinh)", async function () {
      const f = await loadFixture(deployAll);
      // To chuc #1: 2 dai dien. To chuc #2: 5 dai dien.
      await f.registry.connect(f.outsider).registerOrganization("To chuc 5 dai dien", ethers.ZeroHash);
      await f.registry.connect(f.platform).verifyOrganization(2);
      await f.registry.connect(f.outsider).addMember(2, f.p1.address, Role.Proposer);
      const five = [f.ap1, f.ap2, f.ap3, f.ap4, f.v4];
      for (const a of five) {
        await f.registry.connect(f.outsider).addMember(2, a.address, Role.Member);
        await f.registry.connect(f.outsider).addApprover(2, a.address);
      }
      await f.core.connect(f.p1).createElection(params(f, { organizationId: 1 }));
      await f.core.connect(f.p1).createElection(params(f, { organizationId: 2 }));
      expect((await f.core.getElectionStats(0)).requiredApprovals).to.equal(2);
      expect((await f.core.getElectionStats(1)).requiredApprovals).to.equal(4);
      expect((await f.core.getApprovers(1)).length).to.equal(5);
    });

    it("[6] khong them duoc dai dien trung dia chi; dai dien phai la thanh vien", async function () {
      const f = await loadFixture(deployAll);
      const r = f.registry.connect(f.owner);
      await expect(r.addApprover(1, f.ap1.address)).to.be.revertedWithCustomError(f.registry, "AlreadyApprover");
      await expect(r.addApprover(1, f.outsider.address)).to.be.revertedWithCustomError(f.registry, "NotMember");
      await expect(r.replaceApprover(1, f.ap1.address, f.ap2.address)).to.be.revertedWithCustomError(f.registry, "AlreadyApprover");
    });

    it("toi da 10 dai dien (MAX_APPROVERS): dai dien thu 11 bi ApproverLimit", async function () {
      const f = await loadFixture(deployAll);
      const r = f.registry.connect(f.owner);
      expect(await f.registry.MAX_APPROVERS()).to.equal(10);
      const extra = [f.p1, f.p2, f.p3, f.p4, f.ap3, f.ap4, f.v1, f.v2];
      for (const a of extra) {
        if ((await f.registry.roleOf(1, a.address)) === 0n) await r.addMember(1, a.address, Role.Member);
        await r.addApprover(1, a.address);
      }
      expect((await f.registry.getApprovers(1)).length).to.equal(10);
      await r.addMember(1, f.v3.address, Role.Member);
      await expect(r.addApprover(1, f.v3.address)).to.be.revertedWithCustomError(f.registry, "ApproverLimit");
    });

    it("go dai dien: duoc khi con >= 3; o muc 2 thi bi ApproverLimit, phai dung replaceApprover", async function () {
      const f = await loadFixture(deployAll);
      const r = f.registry.connect(f.owner);
      await expect(r.removeApprover(1, f.ap1.address)).to.be.revertedWithCustomError(f.registry, "ApproverLimit");
      await r.addApprover(1, f.p1.address);
      await expect(r.removeApprover(1, f.ap1.address)).to.emit(f.registry, "ApproverRemoved").withArgs(1, f.ap1.address);
      expect(await f.registry.isOrgApprover(1, f.ap1.address)).to.equal(false);
      await expect(r.replaceApprover(1, f.p1.address, f.p2.address)).to.emit(f.registry, "ApproverReplaced").withArgs(1, f.p1.address, f.p2.address);
      await expect(r.removeApprover(1, f.v1.address)).to.be.revertedWithCustomError(f.registry, "NotAnApprover");
    });

    it("nhom duyet duoc CHUP luc tao: doi dai dien sau do khong anh huong cuoc bau cu dang cho duyet", async function () {
      const f = await loadFixture(deployAll);
      await f.core.connect(f.p1).createElection(params(f));
      await f.registry.connect(f.owner).replaceApprover(1, f.ap1.address, f.p2.address);
      expect(await f.core.isApprover(0, f.ap1.address)).to.equal(true);   // dai dien cu van duyet duoc cuoc cu
      expect(await f.core.isApprover(0, f.p2.address)).to.equal(false);   // dai dien moi khong ap vao cuoc cu
      await f.core.connect(f.ap1).approveElection(0);
      await f.core.connect(f.ap2).approveElection(0);
      expect((await f.core.getElectionBasicInfo(0)).isActivated).to.equal(true);
      await f.core.connect(f.p1).createElection(params(f));               // cuoc moi dung nhom moi
      expect(await f.core.isApprover(1, f.p2.address)).to.equal(true);
      expect(await f.core.isApprover(1, f.ap1.address)).to.equal(false);
    });

    it("[8] chi duoc thong qua khi DU chu ky: 1/2 chua kich hoat, 2/2 moi kich hoat", async function () {
      const f = await loadFixture(deployAll);
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.ap1).approveElection(0);
      expect((await f.core.getElectionBasicInfo(0)).isActivated).to.equal(false);
      expect(await f.core.requestStatus(0)).to.equal(Req.Pending);
      await expect(f.core.connect(f.ap2).approveElection(0)).to.emit(f.core, "ElectionActivated");
      expect(await f.core.requestStatus(0)).to.equal(Req.Approved);
    });

    it("[8] nguoi khong thuoc nhom duyet cua cuoc do (ke ca Manager, platformAdmin) khong duyet duoc", async function () {
      const f = await loadFixture(deployAll);
      await f.core.connect(f.p1).createElection(params(f));
      for (const who of [f.owner, f.platform, f.outsider, f.p2]) await expect(f.core.connect(who).approveElection(0)).to.be.revertedWithCustomError(f.core, "NotApprover");
    });
  });

  // ===================================================================== D
  describe("D. Xung dot loi ich & tu duyet", function () {
    async function withApprovers(f, n) {
      const extra = [f.ap3, f.ap4, f.v4].slice(0, n - 2);
      for (const a of extra) { await f.registry.connect(f.owner).addMember(1, a.address, Role.Member); await f.registry.connect(f.owner).addApprover(1, a.address); }
    }

    it("[7] nguoi tao la dai dien: bi loai khoi nhom duyet cua cuoc minh (khong tu duyet), nguong tinh lai tren so con lai", async function () {
      const f = await loadFixture(deployAll);
      await withApprovers(f, 3);                                  // ap1, ap2, ap3
      await f.registry.connect(f.owner).addMember(1, f.ap3.address, Role.Member).catch(() => {});
      await f.registry.connect(f.owner).updateMemberRole(1, f.ap3.address, Role.Proposer); // ap3 vua la dai dien vua de xuat duoc
      await expect(f.core.connect(f.ap3).createElection(params(f)))
        .to.emit(f.core, "ApproverExcluded").withArgs(0, f.ap3.address);
      expect(await f.core.isApprover(0, f.ap3.address)).to.equal(false);
      expect((await f.core.getApprovers(0)).length).to.equal(2);
      expect((await f.core.getElectionStats(0)).requiredApprovals).to.equal(2);
      await expect(f.core.connect(f.ap3).approveElection(0)).to.be.revertedWithCustomError(f.core, "NotApprover");
    });

    it("[7] nguoi tao la dai dien ma con lai < 2 dai dien doc lap -> NotEnoughApprovers (khong the tu duyet)", async function () {
      const f = await loadFixture(deployAll);
      await f.registry.connect(f.owner).updateMemberRole(1, f.ap1.address, Role.Proposer);
      await expect(f.core.connect(f.ap1).createElection(params(f))).to.be.revertedWithCustomError(f.core, "NotEnoughApprovers");
    });

    it("xung dot loi ich: dai dien khai bao la ung vien bi loai, khong duyet duoc cuoc bau cu cua chinh minh", async function () {
      const f = await loadFixture(deployAll);
      await withApprovers(f, 3);
      await expect(f.core.connect(f.p1).createElection(params(f, { candidateWallets: [f.ap1.address] })))
        .to.emit(f.core, "ApproverExcluded").withArgs(0, f.ap1.address);
      await expect(f.core.connect(f.ap1).approveElection(0)).to.be.revertedWithCustomError(f.core, "NotApprover");
      // 2 dai dien con lai quyet dinh
      await f.core.connect(f.ap2).approveElection(0);
      await expect(f.core.connect(f.ap3).approveElection(0)).to.emit(f.core, "ElectionActivated");
    });

    it("xung dot loi ich lam nhom duyet con < 2 -> tu choi tao", async function () {
      const f = await loadFixture(deployAll);
      await expect(f.core.connect(f.p1).createElection(params(f, { candidateWallets: [f.ap1.address] }))).to.be.revertedWithCustomError(f.core, "NotEnoughApprovers");
    });

    it("to chuc chua dat 2 dai dien -> khong tao duoc cuoc bau cu", async function () {
      const f = await loadFixture(deployAll);
      await f.registry.connect(f.outsider).registerOrganization("Moi lap", ethers.ZeroHash);
      await f.registry.connect(f.platform).verifyOrganization(2);
      await f.registry.connect(f.outsider).addApprover(2, f.outsider.address);
      await expect(f.core.connect(f.outsider).createElection(params(f, { organizationId: 2 }))).to.be.revertedWithCustomError(f.core, "NotEnoughApprovers");
    });
  });

  // ===================================================================== E
  describe("E. Tu choi yeu cau", function () {
    it("n=2, nguong 2: chi can 1 phieu tu choi la dong yeu cau (khong the dat nguong)", async function () {
      const f = await loadFixture(deployAll);
      await f.core.connect(f.p1).createElection(params(f));
      await expect(f.core.connect(f.ap1).rejectElection(0)).to.emit(f.core, "ElectionRejected").withArgs(0);
      expect(await f.core.requestStatus(0)).to.equal(Req.Rejected);
      await expect(f.core.connect(f.ap2).approveElection(0)).to.be.revertedWithCustomError(f.core, "RequestClosed");
    });

    it("n=3, nguong 2: 1 tu choi chua dong, 2 tu choi thi dong", async function () {
      const f = await loadFixture(deployAll);
      await f.registry.connect(f.owner).addMember(1, f.ap3.address, Role.Member);
      await f.registry.connect(f.owner).addApprover(1, f.ap3.address);
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.ap1).rejectElection(0);
      expect(await f.core.requestStatus(0)).to.equal(Req.Pending);
      await f.core.connect(f.ap2).rejectElection(0);
      expect(await f.core.requestStatus(0)).to.equal(Req.Rejected);
    });

    it("da duyet thi khong tu choi duoc va nguoc lai; khong tu choi hai lan; nguoi la khong tu choi duoc", async function () {
      const f = await loadFixture(deployAll);
      await f.registry.connect(f.owner).addMember(1, f.ap3.address, Role.Member);
      await f.registry.connect(f.owner).addApprover(1, f.ap3.address);
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.ap1).approveElection(0);
      await expect(f.core.connect(f.ap1).rejectElection(0)).to.be.revertedWithCustomError(f.core, "AlreadyRejected");
      await f.core.connect(f.ap2).rejectElection(0);
      await expect(f.core.connect(f.ap2).rejectElection(0)).to.be.revertedWithCustomError(f.core, "AlreadyRejected");
      await expect(f.core.connect(f.ap2).approveElection(0)).to.be.revertedWithCustomError(f.core, "AlreadyRejected");
      await expect(f.core.connect(f.outsider).rejectElection(0)).to.be.revertedWithCustomError(f.core, "NotApprover");
    });

    it("da kich hoat thi dai dien chua bieu quyet khong con tu choi duoc (RequestClosed)", async function () {
      const f = await loadFixture(deployAll);
      await f.registry.connect(f.owner).addMember(1, f.ap3.address, Role.Member);
      await f.registry.connect(f.owner).addApprover(1, f.ap3.address);
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.ap1).approveElection(0);
      await f.core.connect(f.ap2).approveElection(0);
      await expect(f.core.connect(f.ap3).rejectElection(0)).to.be.revertedWithCustomError(f.core, "RequestClosed");
    });
  });
});
