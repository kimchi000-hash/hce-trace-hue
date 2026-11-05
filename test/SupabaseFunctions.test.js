// Kiem thu phan logic dung chung cua Edge Function (chay duoc ngoai Deno): chuan hoa hash, thong diep dang nhap, doc chuoi.
// KHONG kiem thu: HTTP handler (Deno.serve), ket noi Supabase that, RPC that. Xem docs/SUPABASE_SETUP.md muc "Chua kiem thu".
const { expect } = require("chai");
const { ethers } = require("hardhat");
const meta = require("../scripts/metadata");
const { deployAll, params, makeMeta } = require("./helpers");

const F = "../supabase/functions/_shared/";
let M, S, C;
before(async () => { M = await import(F + "metadata.ts"); S = await import(F + "siwe.ts"); C = await import(F + "chain.ts"); });

describe("Edge Function: logic dung chung", () => {
  describe("A. Hash metadata ban TypeScript == ban JS (frontend/script)", () => {
    const samples = [
      { b: 1, a: [3, 2, { z: null, y: true }], "ké": "Tiếng Việt" },
      { s: "é", t: "é", u: "😀 \u0000", n: -9007199254740991 },
      { schema: "votechain.candidate.v1", index: 0, documents: [], avatar: null },
    ];
    it("canonicalize va hash giong het", () => {
      for (const o of samples) { expect(M.canonicalize(o)).to.equal(meta.canonicalize(o)); expect(M.metadataHash(o)).to.equal(meta.metadataHash(o)); }
    });
    it("tu choi so thuc / undefined / khoa trung sau NFC giong ban JS", () => {
      for (const bad of [{ a: 1.5 }, { a: undefined }, { "é": 1, "é": 2 }, { a: NaN }]) {
        expect(() => M.canonicalize(bad)).to.throw(); expect(() => meta.canonicalize(bad)).to.throw();
      }
    });
    it("hashMatches phat hien sua noi dung", () => {
      const o = { x: "abc" }; const h = M.metadataHash(o);
      expect(M.hashMatches(o, h)).to.equal(true); expect(M.hashMatches({ x: "abd" }, h)).to.equal(false); expect(M.hashMatches({ x: 1.5 }, h)).to.equal(false);
    });
  });

  describe("B. Dang nhap bang vi", () => {
    const base = (w) => ({ domain: "votechain.example", wallet: w, nonce: "ab".repeat(16), issuedAt: "2026-11-05T00:00:00.000Z", expiresAt: "2026-11-05T00:05:00.000Z", chainId: 11155111 });
    it("chu ky dung vi hop le; sai vi / thong diep bi sua / chu ky rac deu bi tu choi", async () => {
      const [a, b] = await ethers.getSigners();
      const msg = S.buildLoginMessage(base(a.address));
      const sig = await a.signMessage(msg);
      expect(S.signatureMatches(msg, sig, a.address)).to.equal(true);
      expect(S.signatureMatches(msg, sig, b.address)).to.equal(false);                                    // vi khac
      expect(S.signatureMatches(msg.replace("votechain.example", "evil.example"), sig, a.address)).to.equal(false); // domain khac
      expect(S.signatureMatches(msg.replace("ab".repeat(16), "cd".repeat(16)), sig, a.address)).to.equal(false);    // nonce khac
      expect(S.signatureMatches(msg, "0x" + "00".repeat(65), a.address)).to.equal(false);
      expect(S.signatureMatches(msg, "khong-phai-chu-ky", a.address)).to.equal(false);
    });
    it("thong diep chua domain, chainId, nonce, thoi han", async () => {
      const [a] = await ethers.getSigners();
      const m = S.buildLoginMessage(base(a.address));
      for (const k of ["Domain: votechain.example", "Chain ID: 11155111", "Nonce: " + "ab".repeat(16), "Issued At:", "Expiration Time:", ethers.getAddress(a.address)]) expect(m).to.contain(k);
    });
    it("requesterHash: bam on dinh, khong lo IP, phan biet muoi; clientIp loc dau vao la", async () => {
      const R = await import(F + "requester.ts");
      const h1 = await R.requesterHash("203.0.113.7", "salt1"), h2 = await R.requesterHash("203.0.113.7", "salt1"), h3 = await R.requesterHash("203.0.113.8", "salt1"), h4 = await R.requesterHash("203.0.113.7", "salt2");
      expect(h1).to.equal(h2); expect(h1).to.match(/^[0-9a-f]{32}$/); expect(h1).to.not.equal(h3); expect(h1).to.not.equal(h4); expect(h1).to.not.contain("203");
      expect(await R.requesterHash(null, "s")).to.equal(null);
      const hd = (o) => ({ get: (k) => o[k] ?? null });
      expect(R.clientIp(hd({ "cf-connecting-ip": "1.2.3.4" }))).to.equal("1.2.3.4");
      expect(R.clientIp(hd({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).to.equal("5.6.7.8");
      expect(R.clientIp(hd({ "x-forwarded-for": "2001:DB8::1" }))).to.equal("2001:db8::1");
      for (const bad of ["'; drop table x;--", "a".repeat(100), "", "1.2.3.4 5.6.7.8"]) expect(R.clientIp(hd({ "x-real-ip": bad }))).to.equal(null);
    });
    it("dinh dang dau vao & nonce ngau nhien & so sanh hang so", () => {
      expect(S.WALLET_RE.test("0x" + "a".repeat(40))).to.equal(true); expect(S.WALLET_RE.test("0x123")).to.equal(false);
      const n1 = S.randomNonce(), n2 = S.randomNonce();
      expect(S.NONCE_RE.test(n1)).to.equal(true); expect(n1).to.not.equal(n2);
      expect(S.timingSafeEqual("abc", "abc")).to.equal(true); expect(S.timingSafeEqual("abc", "abd")).to.equal(false); expect(S.timingSafeEqual("abc", "abcd")).to.equal(false);
      expect(S.walletEmail("0xABCDEF" + "0".repeat(34))).to.match(/^0xabcdef0+@wallet\.votechain\.local$/);
    });
  });

  describe("C. Doc chuoi -> hang mirror (hop dong that tren Hardhat)", () => {
    let f, m, snap;
    before(async () => {
      f = await deployAll(); m = makeMeta(f);
      await f.core.connect(f.p1).createElection(params(f));
      await f.core.connect(f.p1).updateElectionMetadata(0, ethers.id("v2")); // phien ban 2 de co lich su
      snap = await C.readChain(ethers.provider, { registry: await f.registry.getAddress(), core: await f.core.getAddress(), fromBlock: 0, chunk: 7 });
    });
    it("doc to chuc, thanh vien, dai dien dung nhu tren chuoi", () => {
      expect(snap.orgs).to.have.length(1);
      const o = snap.orgs[0];
      expect(o.name).to.equal("CLB Blockchain K58"); expect(o.status).to.equal("Verified"); expect(o.owner).to.equal(f.owner.address.toLowerCase());
      expect(o.members.find((x) => x.wallet === f.p1.address.toLowerCase()).role).to.equal("Proposer");
      expect(o.members.find((x) => x.wallet === f.owner.address.toLowerCase()).role).to.equal("Manager");
      expect(o.approvers.sort()).to.deep.equal([f.ap1.address, f.ap2.address].map((a) => a.toLowerCase()).sort());
    });
    it("doc cuoc bau cu, hash hien hanh, ho so ung vien", () => {
      const e = snap.elections[0];
      expect(e.orgId).to.equal(1); expect(e.proposer).to.equal(f.p1.address.toLowerCase()); expect(e.requestStatus).to.equal("Pending");
      expect(e.metadataHash).to.equal(ethers.id("v2")); expect(e.metadataVersion).to.equal(2);
      expect(e.candidates).to.deep.equal(["Nguyen Van A", "Tran Thi B"]);
      expect(e.candidateMeta.map((x) => x.hash)).to.deep.equal(m.candidateMetadataHashes);
    });
    it("su kien duoc doc ca khi chia khoang nho (chunk=7)", () => {
      const el = snap.events.filter((x) => x.type === "election").map((x) => [x.version, x.hash]);
      expect(el).to.deep.equal([[1, m.metadataHash], [2, ethers.id("v2")]]);
      expect(snap.events.filter((x) => x.type === "candidate")).to.have.length(2);
    });
    it("hang mirror: thoi gian ISO, trang thai, khong chua noi dung ngoai chuoi", () => {
      const rows = C.buildMirrorRows(snap, () => "11111111-1111-4111-8111-111111111111");
      expect(rows.organizations[0]).to.include({ organization_id_onchain: 1, verification_status: "Verified" });
      expect(rows.elections[0].reg_end).to.match(/^\d{4}-\d\d-\d\dT/);
      expect(rows.elections[0]).to.not.have.property("title");
      expect(C.buildMirrorRows(snap, () => undefined).elections).to.have.length(0); // to chuc chua dong bo => bo qua, khong nem loi
    });
    describe("xac minh noi dung theo hash", () => {
      let snap1;
      before(async () => {
        // cuoc bau cu thu hai dung metadata that
        const f2 = await deployAll(); const m2 = makeMeta(f2);
        await f2.core.connect(f2.p1).createElection(params(f2));
        snap1 = await C.readChain(ethers.provider, { registry: await f2.registry.getAddress(), core: await f2.core.getAddress(), fromBlock: 0 });
        snap1.m = m2;
      });
      const hashOf = (o) => { try { return meta.metadataHash(o); } catch { return null; } };
      const drafts = (m) => [
        { metadata_type: "election", metadata_hash: m.metadataHash, candidate_id_onchain: null, content: m.election },
        ...m.candidates.map((c, i) => ({ metadata_type: "candidate", metadata_hash: m.candidateMetadataHashes[i], candidate_id_onchain: i, content: c })),
      ];
      it("noi dung dung hash -> verified, ten ung vien khop chuoi", () => {
        const r = C.buildContentRows(snap1, drafts(snap1.m), hashOf, () => "u");
        expect(r.electionsMeta[0].status).to.equal("verified"); expect(r.electionsMeta[0].title).to.equal("Bau Ban can su lop K58");
        expect(r.candidates.map((c) => [c.status, c.name_matches_chain])).to.deep.equal([["verified", true], ["verified", true]]);
      });
      it("ban nhap khai sai candidate_id (hoac loai) khong duoc nhan du hash khop", () => {
        const d = drafts(snap1.m);
        d[1].candidate_id_onchain = 1;                                  // ho so ung vien 0 nhung khai la ung vien 1
        d[2].candidate_id_onchain = null;                               // ung vien khong co id (CSDL cung chan, day la lop phong thu thu hai)
        const r = C.buildContentRows(snap1, d, hashOf, () => "u");
        expect(r.candidates.map((c) => c.status)).to.deep.equal(["awaiting_content", "awaiting_content"]);
        d[0].candidate_id_onchain = 0;                                  // cuoc bau cu khong duoc co id
        expect(C.buildContentRows(snap1, d, hashOf, () => "u").electionsMeta[0].status).to.equal("awaiting_content");
      });
      it("noi dung bi sua (khong khop hash) -> khong duoc xac minh", () => {
        const d = drafts(snap1.m); d[0].content = { ...d[0].content, title: "Tieu de gia" };
        const r = C.buildContentRows(snap1, d, hashOf, () => "u");
        expect(r.electionsMeta[0].status).to.equal("awaiting_content"); expect(r.electionsMeta[0].title).to.equal(null);
      });
      it("ban nhap khai hash dung nhung noi dung khong khop -> bi bo qua, khong 'chiem' duoc hash", () => {
        const fake = [{ metadata_type: "election", metadata_hash: snap1.m.metadataHash, candidate_id_onchain: null, content: { schema: "votechain.election.v1", title: "rac" } }];
        expect(C.buildContentRows(snap1, fake, hashOf, () => "u").electionsMeta[0].status).to.equal("awaiting_content");
      });
      it("hoan doi ho so giua hai ung vien bi phat hien (index)", () => {
        const sw = snap1.m.candidates.map((c) => ({ ...c })); const [a, b] = [sw[0], sw[1]];
        const d = [
          { metadata_type: "candidate", metadata_hash: snap1.m.candidateMetadataHashes[0], candidate_id_onchain: 0, content: a },
          { metadata_type: "candidate", metadata_hash: snap1.m.candidateMetadataHashes[1], candidate_id_onchain: 1, content: b },
        ];
        // gia lap chuoi dang tro hash ung vien 0 vao ho so cua ung vien 1
        const s2 = JSON.parse(JSON.stringify(snap1)); s2.elections[0].candidateMeta[0].hash = snap1.m.candidateMetadataHashes[1]; s2.elections[0].candidateMeta[1].hash = snap1.m.candidateMetadataHashes[0];
        const r = C.buildContentRows(s2, d, hashOf, () => "u");
        expect(r.candidates.map((c) => c.status)).to.deep.equal(["awaiting_content", "awaiting_content"]);
      });
      it("ten trong ho so khac ten tren chuoi -> name_matches_chain = false", () => {
        const m = snap1.m; const c0 = { ...m.candidates[0], fullName: "Nguoi Khac" }; const h = meta.metadataHash(c0);
        const s3 = JSON.parse(JSON.stringify(snap1)); s3.elections[0].candidateMeta[0].hash = h;
        const r = C.buildContentRows(s3, [{ metadata_type: "candidate", metadata_hash: h, candidate_id_onchain: 0, content: c0 }], hashOf, () => "u");
        expect(r.candidates[0].status).to.equal("verified"); expect(r.candidates[0].name_matches_chain).to.equal(false);
      });
      it("URL khong https bi loai (chong javascript:)", () => {
        const e = { ...snap1.m.election, cover: { url: "javascript:alert(1)" } }; const h = meta.metadataHash(e);
        const s4 = JSON.parse(JSON.stringify(snap1)); s4.elections[0].metadataHash = h;
        const r = C.buildContentRows(s4, [{ metadata_type: "election", metadata_hash: h, candidate_id_onchain: null, content: e }], hashOf, () => "u");
        expect(r.electionsMeta[0].status).to.equal("verified"); expect(r.electionsMeta[0].cover_image_url).to.equal(null);
      });
    });
  });
});
