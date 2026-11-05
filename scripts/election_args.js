// scripts/election_args.js
// In ra tham so `createElection` dung de DAN THANG vao Remix (o "p" kieu tuple) - khong phai go tay.
//
// Cach dung:
//   node scripts/election_args.js <voters.json> [options]
// Tuy chon (mac dinh trong ngoac):
//   --title "Ten cuoc bau cu"  (Bau Ban can su lop)
//   --names "A,B,C"            (Ung vien 1,Ung vien 2)
//   --reg 5 --commit 10 --reveal 10   so phut moi pha (5, 10, 10)
//   --quorum 5000              basis points (5000 = 50%)
//   --org 1                    organizationId (to chuc da Verified, nguoi goi la Proposer/Manager)
//   --description ".."         mo ta (dua vao metadata, tinh hash that)
//   --candidate-wallets 0x..,0x..  vi ung vien (tuy chon) de loai khoi nhom duyet
//
// Vi du:
//   node scripts/election_args.js scripts/voters.example.json --org 1 --names "An,Binh"
// Nhom duyet KHONG con truyen o day: hop dong lay tu to chuc (OrganizationRegistry).
const fs = require("fs");
const { ethers } = require("ethers");
const { buildTree } = require("./merkle");
const { metadataHash, electionMetadata, candidateMetadata } = require("./metadata");

function parse(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
    else pos.push(argv[i]);
  }
  return { pos, opt };
}

const { pos, opt } = parse(process.argv.slice(2));
if (pos.length < 1) {
  console.error('Cach dung: node scripts/election_args.js <voters.json> [--org 1] [--title ".."] [--names "A,B"] [--description ".."] [--reg 5] [--commit 10] [--reveal 10] [--quorum 5000] [--candidate-wallets 0x..,0x..]');
  process.exit(1);
}

const voters = JSON.parse(fs.readFileSync(pos[0], "utf8"));
const { root, voterCount } = buildTree(voters);
const orgId = Number(opt.org || 1);
const title = opt.title || "Bau Ban can su lop";
const names = (opt.names || "Ung vien 1,Ung vien 2").split(",").map((s) => s.trim());
const wallets = opt["candidate-wallets"] ? opt["candidate-wallets"].split(",").map((a) => ethers.getAddress(a.trim())) : [];
const em = electionMetadata({ organizationId: orgId, title, description: opt.description || "", schedule: { regMinutes: Number(opt.reg || 5), commitMinutes: Number(opt.commit || 10), revealMinutes: Number(opt.reveal || 10) } });
const cms = names.map((n, i) => candidateMetadata({ index: i, fullName: n }));

// Thu tu truong khop NewElection trong ProjectCore.sol
const tuple = [
  orgId, title, names, wallets,
  Number(opt.reg || 5), Number(opt.commit || 10), Number(opt.reveal || 10),
  Number(opt.quorum || 5000),
  voterCount, root, metadataHash(em), cms.map(metadataHash),
];

console.log("merkleRoot   :", root);
console.log("metadataHash :", metadataHash(em), "(tinh tu metadata chuan hoa, khong phai hash gia)");
console.log("voterCount :", voterCount);
console.log("\nDan chuoi sau vao o 'p' cua createElection trong Remix:\n");
console.log(JSON.stringify(tuple));
