// scripts/gas_report.js
// Do gas THAT cua ProjectCore tren mang Hardhat (cung phien ban/tuy chon voi Remix: 0.8.20, khong optimizer).
// Kich ban: 500 cu tri (cay Merkle sau 9 tang), 5 ung vien, to chuc co 3 dai dien (nguong 2/3 = 2) - quy mo cua Lab 7.
//   npx hardhat run scripts/gas_report.js
// Them  --json  de in ket qua dang JSON:  GAS_JSON=1 npx hardhat run scripts/gas_report.js

const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { buildTree } = require("./merkle");
const { metadataHash, electionMetadata, candidateMetadata } = require("./metadata");

const SIGNERS_USED = 8; // platform + creator + 3 dai dien + 2 cu tri that
const N_VOTERS = 500;

const commitHash = (id, cid, salt, who) =>
  ethers.solidityPackedKeccak256(["uint256", "uint256", "string", "address"], [id, cid, salt, who]);

async function gas(txPromise) {
  const tx = await txPromise;
  const rc = await tx.wait();
  return Number(rc.gasUsed);
}

async function main() {
  const signers = await ethers.getSigners();
  const [platform, creator, ap1, ap2, ap3, v1, v2] = signers;

  // 500 cu tri: 2 vi that + 498 dia chi ngau nhien (chi can nam trong cay)
  const addresses = [v1.address, v2.address];
  for (let i = 0; i < N_VOTERS - 2; i++) addresses.push(ethers.Wallet.createRandom().address);
  const tree = buildTree(addresses);

  const Reg = await ethers.getContractFactory("OrganizationRegistry");
  const registry = await Reg.connect(platform).deploy();
  const deployRegGas = Number((await registry.deploymentTransaction().wait()).gasUsed);
  const Core = await ethers.getContractFactory("ProjectCore");
  const core = await Core.deploy(await registry.getAddress());
  const deployGas = Number((await core.deploymentTransaction().wait()).gasUsed);

  // To chuc: dang ky -> xac minh -> 3 dai dien
  const registerOrgGas = await gas(registry.connect(creator).registerOrganization("CLB Blockchain K58", ethers.id("org-info")));
  const verifyOrgGas = await gas(registry.connect(platform).verifyOrganization(1));
  let addMemberGas = 0, addApproverGas = 0;
  for (const ap of [ap1, ap2, ap3]) {
    addMemberGas = await gas(registry.connect(creator).addMember(1, ap.address, 1));
    addApproverGas = await gas(registry.connect(creator).addApprover(1, ap.address));
  }

  const names = ["Nguyen Van A", "Tran Thi B", "Le Van C", "Pham Thi D", "Hoang Van E"];
  const em = electionMetadata({ organizationId: 1, title: "Bau Ban can su lop K58", description: "Bau ban can su", purpose: "Chon ban can su" });
  const p = {
    organizationId: 1,
    title: "Bau Ban can su lop K58",
    names,
    candidateWallets: [],
    regMinutes: 5,
    commitMinutes: 10,
    revealMinutes: 10,
    quorumBps: 5000,
    voterCount: tree.voterCount,
    merkleRoot: tree.root,
    metadataHash: metadataHash(em),
    candidateMetadataHashes: names.map((n, i) => metadataHash(candidateMetadata({ index: i, fullName: n }))),
  };

  const createGas = await gas(core.connect(creator).createElection(p));
  const approve1Gas = await gas(core.connect(ap1).approveElection(0)); // chua du nguong
  const approve2Gas = await gas(core.connect(ap2).approveElection(0)); // du nguong -> kich hoat

  // Cuoc thu hai (con o pha Registration) de do cap nhat ho so va tu choi
  const p2 = { ...p, title: "Bau lop truong K58", merkleRoot: ethers.id("root-2") };
  await (await core.connect(creator).createElection(p2)).wait();
  await (await core.connect(ap1).approveElection(1)).wait();
  const newHash = metadataHash(electionMetadata({ organizationId: 1, title: p2.title, description: "Mo ta moi", purpose: "Muc dich moi" }));
  const updateElectionMetaGas = await gas(core.connect(creator).updateElectionMetadata(1, newHash)); // co dat lai 1 chu ky
  const newCandHash = metadataHash(candidateMetadata({ index: 0, fullName: names[0], bio: "Tieu su moi" }));
  const updateCandMetaGas = await gas(core.connect(creator).updateCandidateMetadata(1, 0, newCandHash));
  const rejectGas = await gas(core.connect(ap2).rejectElection(1));

  const st = await core.getElectionStats(0);
  await time.increaseTo(Number(st.regEnd) + 1);

  const salt1 = ethers.hexlify(ethers.randomBytes(32));
  const salt2 = ethers.hexlify(ethers.randomBytes(32));
  const commit1Gas = await gas(core.connect(v1).commit(0, commitHash(0, 0, salt1, v1.address), tree.proofs[v1.address]));
  const commit2Gas = await gas(core.connect(v2).commit(0, commitHash(0, 0, salt2, v2.address), tree.proofs[v2.address]));

  await time.increaseTo(Number(st.commitEnd) + 1);
  const reveal1Gas = await gas(core.connect(v1).reveal(0, 0, salt1)); // la dau tien cua ung vien 0
  const reveal2Gas = await gas(core.connect(v2).reveal(0, 0, salt2)); // la sau cua cung ung vien

  // The cu tri soulbound (khong anh ngoai: dung SVG du phong tren chuoi)
  const Sbt = await ethers.getContractFactory("VoterCardSBT");
  const sbt = await Sbt.deploy(await core.getAddress(), "", 0, "");
  const deploySbtGas = Number((await sbt.deploymentTransaction().wait()).gasUsed);
  const mintGas = await gas(sbt.connect(v1).mint(0, 0));

  await time.increaseTo(Number(st.revealEnd) + 1);
  const resultGas = Number(await core.result.estimateGas(0));
  const r = await core.result(0);

  const rows = {
    deploy_OrganizationRegistry: deployRegGas,
    deploy_ProjectCore: deployGas,
    registerOrganization: registerOrgGas,
    verifyOrganization: verifyOrgGas,
    addMember: addMemberGas,
    addApprover: addApproverGas,
    createElection: createGas,
    approveElection_chua_du: approve1Gas,
    approveElection_kich_hoat: approve2Gas,
    updateElectionMetadata_dat_lai_chu_ky: updateElectionMetaGas,
    updateCandidateMetadata: updateCandMetaGas,
    rejectElection: rejectGas,
    commit_cu_tri_1: commit1Gas,
    commit_cu_tri_2: commit2Gas,
    reveal_la_dau_cua_ung_vien: reveal1Gas,
    reveal_la_sau_cung_ung_vien: reveal2Gas,
    deploy_VoterCardSBT: deploySbtGas,
    mint_the_cu_tri: mintGas,
    result_view_estimate: resultGas,
  };

  if (process.env.GAS_JSON) {
    console.log(JSON.stringify({ voters: N_VOTERS, proofDepth: tree.proofs[v1.address].length, rows, result: [r.valid, Number(r.winnerId), Number(r.topVotes)] }));
    return;
  }

  console.log(`ProjectCore - do gas thuc te (${N_VOTERS} cu tri, cay Merkle ${tree.proofs[v1.address].length} tang)\n`);
  console.log("| Thao tac | Gas |");
  console.log("| :--- | ---: |");
  for (const [k, v] of Object.entries(rows)) console.log(`| ${k} | ${v.toLocaleString("en-US")} |`);
  console.log(`\nresult(0) -> valid=${r.valid}, winnerId=${r.winnerId}, topVotes=${r.topVotes}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
