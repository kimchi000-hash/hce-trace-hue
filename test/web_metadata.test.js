// Ban chuan hoa + hash metadata nhung trong web/index.html PHAI cho ra hash y het scripts/metadata.js
// (va do do y het supabase/functions/_shared/metadata.ts), neu khong hash tren chuoi se khong bao gio khop noi dung.
const { expect } = require("chai");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const ref = require("../scripts/metadata.js");

const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
const m = html.match(/\/\*META-START\*\/([\s\S]*?)\/\*META-END\*\//);
if (!m) throw new Error("Khong tim thay khoi META trong web/index.html");
const web = new Function("ethers", m[1] + "\nreturn { canonicalize, metadataHash, mkElectionMeta, mkCandidateMeta, mkOrgProfile, mkVisibility };")(ethers);

describe("web/index.html: chuan hoa metadata khop scripts/metadata.js", function () {
  const nfd = "Nguyễn Văn A";   // dau to hop (NFD)
  const nfc = nfd.normalize("NFC");
  const fixtures = {
    election: { organizationId: 7, title: "Bầu Ban cán sự", description: "Mô tả \"có\" dấu ngoặc\nxuống dòng", purpose: "", eligibility: "Sinh viên K23", cover: { role: "cover", name: "a.png", mime: "image/png", size: 10, checksum: "0x" + "ab".repeat(32), url: "https://x.supabase.co/storage/v1/object/public/election-assets/7/cover/0xab.png" } },
    candidate: { index: 1, fullName: nfd, bio: "tiểu sử", experience: "", achievements: "a", manifesto: "m", avatar: null },
  };
  it("canonicalize giong het nhau tren nhieu mau (ca khoa NFD, mang, long nhau, emoji)", function () {
    const sample = { b: [3, { y: 1, x: "é" }], a: "é", c: null, d: false, "ß": 0 };
    expect(web.canonicalize(sample)).to.equal(ref.canonicalize(sample));
    expect(web.metadataHash(sample)).to.equal(ref.metadataHash(sample));
  });
  it("hash metadata cuoc bau cu va ung vien giong scripts/metadata.js", function () {
    const e = web.mkElectionMeta(fixtures.election), re = ref.electionMetadata(fixtures.election);
    expect(e).to.deep.equal(re);
    expect(web.metadataHash(e)).to.equal(ref.metadataHash(re));
    const c = web.mkCandidateMeta(fixtures.candidate), rc = ref.candidateMetadata(fixtures.candidate);
    expect(c).to.deep.equal(rc);
    expect(web.metadataHash(c)).to.equal(ref.metadataHash(rc));
  });
  it("pham vi xem + salt: ban web == scripts, thu tu vai tro khong doi hash, khong truyen thi hash cu giu nguyen", function () {
    const base = fixtures.election, vis = { info: "public", candidates: "internal", results: "restricted", roles: ["Proposer", "Manager", "Manager"] };
    const a = web.mkElectionMeta({ ...base, visibility: vis, salt: "s1" }), b = ref.electionMetadata({ ...base, visibility: { ...vis, roles: ["Manager", "Proposer"] }, salt: "s1" });
    expect(a).to.deep.equal(b);
    expect(a.visibility.roles).to.deep.equal(["Manager", "Proposer"]);
    expect(web.metadataHash(a)).to.equal(ref.metadataHash(b));
    expect(web.metadataHash(a)).to.not.equal(web.metadataHash(web.mkElectionMeta({ ...base, visibility: vis, salt: "s2" })));   // salt doi hash
    expect(web.mkElectionMeta(base)).to.not.have.property("visibility");                                                      // cuoc bau cu cu: khong them khoa
    expect(web.mkElectionMeta(base)).to.not.have.property("salt");
    expect(web.metadataHash(web.mkElectionMeta(base))).to.equal(ref.metadataHash(ref.electionMetadata(base)));
    const c = web.mkCandidateMeta({ ...fixtures.candidate, salt: "x" }), rc = ref.candidateMetadata({ ...fixtures.candidate, salt: "x" });
    expect(c).to.deep.equal(rc); expect(c.salt).to.equal("x");
    expect(web.mkCandidateMeta(fixtures.candidate)).to.not.have.property("salt");
  });
  it("pham vi xem sai bi tu choi (khong am tham thanh cong khai)", function () {
    for (const bad of [{ info: "all", candidates: "public", results: "public" }, { info: "public", candidates: "public" }, { info: "public", candidates: "public", results: "public", roles: ["Member"] }, null]) {
      expect(() => web.mkVisibility(bad)).to.throw(); expect(() => ref.visibilityMetadata(bad)).to.throw();
    }
  });
  it("hash ho so to chuc giong scripts/metadata.js (co va khong co nam thanh lap)", function () {
    const f1 = { name: "CLB Công nghệ", organizationType: "club", description: "Mô tả \"dài\"\nnhiều dòng", affiliation: "Khoa Kinh tế", contactEmail: "a@b.vn", website: "https://example.vn", foundedYear: 2019 };
    const f2 = { name: "Lớp K58", organizationType: "class" };
    for (const f of [f1, f2]) {
      const a = web.mkOrgProfile(f), b = ref.organizationMetadata(f);
      expect(a).to.deep.equal(b);
      expect(web.metadataHash(a)).to.equal(ref.metadataHash(b));
    }
    expect(web.mkOrgProfile(f2).foundedYear).to.equal(null);
    expect(web.metadataHash(web.mkOrgProfile(f1))).to.not.equal(web.metadataHash(web.mkOrgProfile({ ...f1, foundedYear: 2020 })));
  });
  it("chuoi NFC va NFD cho cung mot hash (khong co hai ten 'khac nhau' vo hinh)", function () {
    const a = web.mkCandidateMeta({ index: 0, fullName: nfd }), b = web.mkCandidateMeta({ index: 0, fullName: nfc });
    expect(web.metadataHash(a)).to.equal(web.metadataHash(b));
  });
  it("tu choi so thuc, undefined va khoa trung sau chuan hoa (giong ban goc)", function () {
    expect(() => web.canonicalize({ a: 1.5 })).to.throw();
    expect(() => web.canonicalize({ a: undefined })).to.throw();
    expect(() => web.canonicalize({ "é": 1, "é": 2 })).to.throw();
    expect(() => ref.canonicalize({ "é": 1, "é": 2 })).to.throw();
  });
});
