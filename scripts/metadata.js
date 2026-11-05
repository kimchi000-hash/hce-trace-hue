// scripts/metadata.js - Chuan hoa JSON + keccak256 cho metadata cuoc bau cu / ung vien (VoteChain v2).
//
// QUY TAC CHUAN HOA (canonical JSON, phai y het ban nhung trong web/index.html):
//   1. Khoa object duoc sap xep tang dan theo thu tu ma don vi UTF-16 (sort() mac dinh), khong khoang trang.
//   2. Chuoi duoc chuan hoa Unicode NFC (ca khoa va gia tri) roi ma hoa bang JSON.stringify.
//   3. So chi nhan so nguyen an toan (Number.isSafeInteger); so thuc / NaN / Infinity bi tu choi.
//   4. null, boolean, mang (giu nguyen thu tu), object long nhau deu duoc phep; undefined bi tu choi
//      (tranh viec "co khoa" va "khong co khoa" cho ra hai hash khac nhau mot cach am tham).
//   5. hash = keccak256(UTF-8 bytes cua chuoi chuan hoa), tuong thich ethers.js / Solidity.
// Anh va tai lieu: KHONG hash URL; hash noi dung file (keccak256 cua bytes) va dua vao manifest trong metadata.
const { ethers } = require("ethers");

function canonicalize(v) {
  if (v === null) return "null";
  switch (typeof v) {
    case "boolean": return v ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(v)) throw new Error("metadata chi nhan so nguyen an toan, nhan: " + v);
      return String(v);
    case "string": return JSON.stringify(v.normalize("NFC"));
    case "object": {
      if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
      const keys = Object.keys(v).map((k) => [k.normalize("NFC"), k]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      for (let i = 1; i < keys.length; i++) if (keys[i][0] === keys[i - 1][0]) throw new Error("khoa bi trung sau khi chuan hoa: " + keys[i][0]);
      return "{" + keys.map(([nk, k]) => JSON.stringify(nk) + ":" + canonicalize(v[k])).join(",") + "}";
    }
    default: throw new Error("metadata khong ho tro kieu " + typeof v);
  }
}

const metadataHash = (obj) => ethers.keccak256(ethers.toUtf8Bytes(canonicalize(obj)));
const fileChecksum = (bytes) => ethers.keccak256(bytes);
const verifyMetadata = (obj, expectedHash) => {
  try { return metadataHash(obj).toLowerCase() === String(expectedHash).toLowerCase(); } catch (_) { return false; }
};

/** Phan tu manifest cua mot file: checksum la hash NOI DUNG file, khong phai hash URL. */
const fileEntry = (role, name, mime, bytes) => ({ role, name, mime, size: bytes.length, checksum: fileChecksum(bytes) });

const electionMetadata = (o) => ({
  schema: "votechain.election.v1",
  organizationId: o.organizationId, title: o.title, description: o.description || "", purpose: o.purpose || "",
  eligibility: o.eligibility || "", schedule: o.schedule || null, extra: o.extra || null, cover: o.cover || null,
});
const candidateMetadata = (o) => ({
  schema: "votechain.candidate.v1",
  index: o.index, fullName: o.fullName, bio: o.bio || "", experience: o.experience || "", achievements: o.achievements || "",
  manifesto: o.manifesto || "", avatar: o.avatar || null, documents: o.documents || [],
});

module.exports = { canonicalize, metadataHash, fileChecksum, verifyMetadata, fileEntry, electionMetadata, candidateMetadata };
