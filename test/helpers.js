// Fixture dung chung cho cac bo test to chuc / chong spam / metadata.
const { ethers } = require("hardhat");
const { buildTree } = require("../scripts/merkle");
const { metadataHash, electionMetadata, candidateMetadata } = require("../scripts/metadata");

const Role = { None: 0, Member: 1, Proposer: 2, Manager: 3 };
const Status = { None: 0, Pending: 1, Verified: 2, Suspended: 3 };
const Req = { Pending: 0n, Approved: 1n, Rejected: 2n, Withdrawn: 3n, Expired: 4n };

async function deployAll() {
  const s = await ethers.getSigners();
  const [owner, ap1, ap2, v1, v2, v3, v4, outsider, , platform, p1, p2, p3, p4, ap3, ap4] = s;
  const registry = await (await ethers.getContractFactory("OrganizationRegistry")).connect(platform).deploy();
  const core = await (await ethers.getContractFactory("ProjectCore")).deploy(await registry.getAddress());
  await registry.connect(owner).registerOrganization("CLB Blockchain K58", ethers.id("org-info"));
  await registry.connect(platform).verifyOrganization(1);
  for (const a of [ap1, ap2]) { await registry.connect(owner).addMember(1, a.address, Role.Member); await registry.connect(owner).addApprover(1, a.address); }
  for (const p of [p1, p2, p3, p4]) await registry.connect(owner).addMember(1, p.address, Role.Proposer);
  const voters = [v1, v2, v3, v4];
  const tree = buildTree(voters.map((v) => v.address));
  return { s, owner, ap1, ap2, ap3, ap4, v1, v2, v3, v4, outsider, platform, p1, p2, p3, p4, registry, core, voters, tree, orgId: 1 };
}

/** Metadata that cua cuoc bau cu + ung vien, hash tinh tu du lieu (khong phai hash gia). */
function makeMeta(f, over = {}) {
  const names = over.names || ["Nguyen Van A", "Tran Thi B"];
  const election = electionMetadata({ organizationId: f.orgId, title: over.title || "Bau Ban can su lop K58", description: "Bau ban can su nhiem ky 2026", purpose: "Chon ban can su", eligibility: "Sinh vien lop K58", schedule: { regMinutes: 5, commitMinutes: 10, revealMinutes: 10 } });
  const candidates = names.map((n, i) => candidateMetadata({ index: i, fullName: n, bio: "Tieu su " + n, experience: "Kinh nghiem " + i, achievements: "Thanh tich " + i, manifesto: "Cam ket " + i }));
  return { election, candidates, metadataHash: metadataHash(election), candidateMetadataHashes: candidates.map(metadataHash) };
}

function params(f, over = {}) {
  const m = makeMeta(f, over);
  return {
    organizationId: f.orgId, title: "Bau Ban can su lop K58", names: ["Nguyen Van A", "Tran Thi B"], candidateWallets: [],
    regMinutes: 5, commitMinutes: 10, revealMinutes: 10, quorumBps: 5000, voterCount: f.tree.voterCount, merkleRoot: f.tree.root,
    metadataHash: m.metadataHash, candidateMetadataHashes: m.candidateMetadataHashes, ...over,
  };
}

module.exports = { Role, Status, Req, deployAll, makeMeta, params };
