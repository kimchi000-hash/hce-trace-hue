// Kiem thu runSync (dong bo chuoi -> Supabase) voi hop dong that tren Hardhat va CSDL gia lap trong bo nho tuong thich supabase-js.
// KHONG kiem thu: PostgREST that, RLS (da co supabase/tests/rls.test.js), Deno.serve.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, params, makeMeta } = require("./helpers");

let S;
before(async () => { S = await import("../supabase/functions/_shared/sync.ts"); });

class Q {
  constructor(db, t) { this.db = db; this.t = t; this.f = []; this.op = "select"; this.lim = null; }
  select() { return this; }
  eq(c, v) { this.f.push((r) => r[c] === v); return this; }
  is(c, v) { this.f.push((r) => (r[c] ?? null) === v); return this; }
  in(c, a) { this.f.push((r) => a.includes(r[c])); return this; }
  lt(c, v) { this.f.push((r) => r[c] < v); return this; }
  not(c, o, v) { if (o === "is") this.f.push((r) => (r[c] ?? null) !== v); return this; }
  order() { return this; }
  limit(n) { this.lim = n; return this; }
  upsert(rows, o) { this.op = "upsert"; this.rows = rows; this.keys = o.onConflict.split(","); return this; }
  insert(row) { this.op = "insert"; this.rows = [row]; return this; }
  update(p) { this.op = "update"; this.patch = p; return this; }
  delete() { this.op = "delete"; return this; }
  then(res, rej) { return Promise.resolve(this.exec()).then(res, rej); }
  exec() {
    const tab = this.db.tables[this.t] ??= [];
    const match = (r) => this.f.every((fn) => fn(r));
    if (this.op === "select") { let out = tab.filter(match).map((r) => ({ ...r })); if (this.lim) out = out.slice(0, this.lim); return { data: out, error: null }; }
    if (this.op === "insert") { for (const r of this.rows) tab.push({ id: "id" + (++this.db.seq), ...r }); return { data: null, error: null }; }
    if (this.op === "upsert") {
      for (const r of this.rows) {
        const ex = tab.find((x) => this.keys.every((k) => x[k] === r[k]));
        if (ex) Object.assign(ex, r); else tab.push({ id: "id" + (++this.db.seq), ...r });
      }
      return { data: null, error: null };
    }
    if (this.op === "update") { tab.filter(match).forEach((r) => Object.assign(r, this.patch)); return { data: null, error: null }; }
    if (this.op === "delete") { this.db.tables[this.t] = tab.filter((r) => !match(r)); return { data: null, error: null }; }
  }
}
const fakeDb = () => { const db = { tables: {}, seq: 0, from: (t) => new Q(db, t), rpc: async () => ({ data: null, error: null }) }; return db; };

describe("runSync (dong bo chuoi -> Supabase)", () => {
  let f, m, db, cfg, hashOf;
  const draftsOf = (mm) => [
    { organization_id: "x", metadata_type: "election", metadata_hash: mm.metadataHash, candidate_id_onchain: null, content: mm.election, onchain_seen: false, created_at: new Date().toISOString() },
    ...mm.candidates.map((c, i) => ({ organization_id: "x", metadata_type: "candidate", metadata_hash: mm.candidateMetadataHashes[i], candidate_id_onchain: i, content: c, onchain_seen: false, created_at: new Date().toISOString() })),
  ].map((d) => ({ ...d }));
  const sync = async () => { const r = await S.runSync(db, ethers.provider, cfg); cfg.lastBlock = r.head; return r; };

  beforeEach(async () => {
    f = await deployAll(); m = makeMeta(f); db = fakeDb();
    cfg = { registry: await f.registry.getAddress(), core: await f.core.getAddress(), deployBlock: 0, lastBlock: 0, chainId: 31337 };
    db.tables.metadata_history = draftsOf(m).map((d, i) => ({ id: "d" + i, ...d }));
    await f.core.connect(f.p1).createElection(params(f));
  });

  it("lan dau: to chuc, thanh vien, dai dien, cuoc bau cu, noi dung da xac minh, nhat ky su kien", async () => {
    const r = await sync();
    expect(r).to.include({ organizations: 1, elections: 1 });
    expect(db.tables.organizations[0]).to.include({ name: "CLB Blockchain K58", verification_status: "Verified" });
    expect(db.tables.organization_members.find((x) => x.wallet_address === f.p1.address.toLowerCase()).role).to.equal("Proposer");
    expect(db.tables.organization_approvers).to.have.length(2);
    expect(db.tables.elections_chain[0]).to.include({ election_id_onchain: 0, request_status: "Pending", candidate_count: 2 });
    expect(db.tables.elections_metadata[0]).to.include({ status: "verified", title: "Bau Ban can su lop K58" });
    expect(db.tables.candidates_metadata.map((c) => [c.status, c.name_matches_chain])).to.deep.equal([["verified", true], ["verified", true]]);
    const ev = db.tables.metadata_history.filter((h) => h.onchain_seen);
    expect(ev).to.have.length(3); expect(ev.every((h) => h.content && h.content_valid && h.transaction_hash)).to.equal(true);
    expect(db.tables.metadata_history.filter((h) => !h.onchain_seen)).to.have.length(0);   // ban nhap da dung bi don
  });

  it("lan dong bo thu hai KHONG lam mat noi dung da xac minh (ban nhap da bi xoa)", async () => {
    await sync(); await sync();
    expect(db.tables.elections_metadata[0].status).to.equal("verified");
    expect(db.tables.elections_metadata[0].title).to.equal("Bau Ban can su lop K58");
    expect(db.tables.candidates_metadata.every((c) => c.status === "verified" && c.full_name)).to.equal(true);
    expect(db.tables.metadata_history.filter((h) => h.onchain_seen)).to.have.length(3);       // khong nhan doi su kien
  });

  it("doi hash tren chuoi khi chua co noi dung -> awaiting_content, co noi dung -> verified va nhat ky v2 duoc dien", async () => {
    await sync();
    const e2 = { ...m.election, title: "Tieu de moi" }; const h2 = require("../scripts/metadata").metadataHash(e2);
    await f.core.connect(f.p1).updateElectionMetadata(0, h2);
    await sync();
    expect(db.tables.elections_metadata[0]).to.include({ status: "awaiting_content", metadata_version: 2, title: null });
    db.tables.metadata_history.push({ id: "late", organization_id: "x", metadata_type: "election", metadata_hash: h2, candidate_id_onchain: null, content: e2, onchain_seen: false, created_at: new Date().toISOString() });
    await sync();
    expect(db.tables.elections_metadata[0]).to.include({ status: "verified", title: "Tieu de moi", metadata_version: 2 });
  });

  it("ban nhap noi dung gia (khong khop hash) khong bao gio duoc xac minh", async () => {
    db.tables.metadata_history = [{ id: "bad", organization_id: "x", metadata_type: "election", metadata_hash: m.metadataHash, candidate_id_onchain: null, content: { ...m.election, title: "GIA MAO" }, onchain_seen: false, created_at: new Date().toISOString() }];
    await sync();
    expect(db.tables.elections_metadata[0]).to.include({ status: "awaiting_content", title: null });
    expect(db.tables.candidates_metadata.every((c) => c.status === "awaiting_content")).to.equal(true);
  });

  it("noi dung khai sai to chuc (organizationId) bi tu choi du hash khop", async () => {
    const bad = { ...m.election, organizationId: 99 }; const hb = require("../scripts/metadata").metadataHash(bad);
    const f2 = await deployAll(); const p = params(f2, { metadataHash: hb });
    db = fakeDb(); db.tables.metadata_history = [{ id: "o", organization_id: "x", metadata_type: "election", metadata_hash: hb, candidate_id_onchain: null, content: bad, onchain_seen: false, created_at: new Date().toISOString() }];
    await f2.core.connect(f2.p1).createElection(p);
    cfg = { registry: await f2.registry.getAddress(), core: await f2.core.getAddress(), deployBlock: 0, lastBlock: 0, chainId: 31337 };
    await sync();
    expect(db.tables.elections_metadata[0].status).to.equal("awaiting_content");
  });

  it("go thanh vien / dai dien tren chuoi -> mirror danh dau removed", async () => {
    await sync();
    await f.registry.connect(f.owner).removeMember(1, f.p2.address);
    await f.registry.connect(f.owner).addMember(1, f.v1.address, 1);
    await f.registry.connect(f.owner).addApprover(1, f.v1.address);
    await f.registry.connect(f.owner).removeApprover(1, f.ap2.address);
    await sync();
    const mem = (w) => db.tables.organization_members.find((x) => x.wallet_address === w.address.toLowerCase());
    expect(mem(f.p2).membership_status).to.equal("removed"); expect(mem(f.p1).membership_status).to.equal("active"); expect(mem(f.v1).membership_status).to.equal("active");
    const ap = (w) => db.tables.organization_approvers.find((x) => x.wallet_address === w.address.toLowerCase());
    expect(ap(f.ap2).status).to.equal("removed"); expect(ap(f.v1).status).to.equal("active");
  });

  it("RPC thuoc mang khac chain mong doi -> tu choi, khong ghi gi", async () => {
    cfg.chainId = 1;
    let err; try { await sync(); } catch (e) { err = e; }
    expect(String(err)).to.match(/chain/);
    expect(db.tables.organizations ?? []).to.have.length(0);
  });

  it("redact() xoa URL co the chua khoa API khoi thong bao loi", async () => {
    const { redact } = await import("../supabase/functions/_shared/redact.ts");
    const msg = redact("failed to fetch https://eth-sepolia.g.alchemy.com/v2/SECRETKEY123 (status 429) and http://x.y/z?k=1");
    expect(msg).to.not.contain("SECRETKEY123"); expect(msg).to.contain("[url]"); expect(redact(undefined)).to.equal("unknown");
    expect(redact("a".repeat(1000)).length).to.equal(300);
  });
});
