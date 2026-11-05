// scripts/merkle.js
// Xay cay Merkle cho danh sach cu tri, KHOP 100% voi ProjectCore.sol:
//   - la (leaf)  = keccak256(abi.encodePacked(address))
//   - nut cha    = keccak256(abi.encodePacked(min(a,b), max(a,b)))   (cap nut duoc sap xep)
//   - nut le o cuoi moi tang duoc "giu nguyen" len tang tren (khong bam voi chinh no)
//
// Cach dung (CLI):
//   node scripts/merkle.js scripts/voters.example.json web/proofs.json
// In ra: merkleRoot, voterCount va ghi file proofs.json (dia chi -> mang proof).
//
// Cach dung (thu vien): const { buildTree, verifyProof } = require("./merkle");

const { ethers } = require("ethers");

function leafOf(address) {
  return ethers.solidityPackedKeccak256(["address"], [ethers.getAddress(address)]);
}

function hashPair(a, b) {
  return BigInt(a) <= BigInt(b)
    ? ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [a, b])
    : ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [b, a]);
}

/** Kiem tra danh sach cu tri: khong rong, dia chi hop le, khac 0x0, khong trung. */
function normalizeVoters(addresses) {
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("Danh sach cu tri rong");
  }
  const seen = new Set();
  return addresses.map((a) => {
    const addr = ethers.getAddress(a); // nem loi neu sai dinh dang / sai checksum
    if (addr === ethers.ZeroAddress) throw new Error("Dia chi 0x0 khong hop le");
    if (seen.has(addr)) throw new Error("Dia chi bi trung: " + addr);
    seen.add(addr);
    return addr;
  });
}

/** @returns {{ root: string, voterCount: number, proofs: Record<string,string[]> }} */
function buildTree(addresses) {
  const voters = normalizeVoters(addresses);
  const layers = [voters.map(leafOf)];

  while (layers[layers.length - 1].length > 1) {
    const cur = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < cur.length; i += 2) {
      next.push(i + 1 < cur.length ? hashPair(cur[i], cur[i + 1]) : cur[i]);
    }
    layers.push(next);
  }

  const proofs = {};
  voters.forEach((addr, leafIndex) => {
    const proof = [];
    let idx = leafIndex;
    for (let level = 0; level < layers.length - 1; level++) {
      const sibling = idx ^ 1;
      if (sibling < layers[level].length) proof.push(layers[level][sibling]);
      idx = Math.floor(idx / 2);
    }
    proofs[addr] = proof;
  });

  return { root: layers[layers.length - 1][0], voterCount: voters.length, proofs };
}

/** Phien ban JS cua MerkleProof.verify trong hop dong. */
function verifyProof(proof, root, address) {
  let h = leafOf(address);
  for (const p of proof) h = hashPair(h, p);
  return h === root;
}

module.exports = { leafOf, hashPair, buildTree, verifyProof };

// ---------------------------------------------------------------- CLI
if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const [, , inputPath, outPath] = process.argv;
  if (!inputPath) {
    console.error("Cach dung: node scripts/merkle.js <voters.json> [web/proofs.json]");
    process.exit(1);
  }
  const voters = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const { root, voterCount, proofs } = buildTree(voters);

  console.log("merkleRoot :", root);
  console.log("voterCount :", voterCount);

  const out = outPath || path.join("web", "proofs.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ merkleRoot: root, voterCount, proofs }, null, 2));
  console.log("Da ghi     :", out);
}
