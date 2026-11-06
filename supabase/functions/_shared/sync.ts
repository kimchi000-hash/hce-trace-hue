// Dong bo chuoi -> Supabase. Tach khoi index.ts de kiem thu duoc (db la bat ky doi tuong tuong thich supabase-js).
import type { Provider } from "ethers";
import { buildContentRows, buildMirrorRows, type Draft, pickVerified, readChain, visibilityOf } from "./chain.ts";
import { metadataHash } from "./metadata.ts";

const REORG_OVERLAP = 20;
const DRAFT_MAX_AGE_DAYS = 30;

export const hashOf = (o: unknown): string | null => { try { return metadataHash(o); } catch { return null; } };
const must = <T extends { error: unknown }>(r: T, what: string): T => { if (r.error) throw new Error(`${what}: ${(r.error as any).message}`); return r; };

export interface SyncConfig { registry: string; core: string; deployBlock: number; lastBlock: number; chainId?: number }

export async function runSync(db: any, provider: Provider, cfg: SyncConfig) {
  if (cfg.chainId !== undefined) {
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== cfg.chainId) throw new Error(`RPC thuoc chain ${net.chainId}, can ${cfg.chainId}`);   // tranh doc nham mang
  }
  const snap = await readChain(provider, { registry: cfg.registry, core: cfg.core, fromBlock: Math.max(cfg.deployBlock, cfg.lastBlock - REORG_OVERLAP) });
  const now = new Date().toISOString();

  // 1. To chuc -> uuid
  const mirror0 = buildMirrorRows({ ...snap, elections: [] }, () => undefined);
  if (mirror0.organizations.length) must(await db.from("organizations").upsert(mirror0.organizations.map((o) => ({ ...o, synced_at: now })), { onConflict: "organization_id_onchain" }), "organizations");
  const { data: orgRows } = must(await db.from("organizations").select("id, organization_id_onchain"), "organizations.select");
  const orgMap = new Map<number, string>((orgRows ?? []).map((r: any) => [Number(r.organization_id_onchain), r.id]));
  const orgUuid = (n: number) => orgMap.get(n);

  // 2. Thanh vien + dai dien (dat 'removed' cho ai khong con tren chuoi)
  for (const o of snap.orgs) {
    const oid = orgUuid(o.id); if (!oid) continue;
    if (o.members.length) must(await db.from("organization_members").upsert(o.members.map((m) => ({ organization_id: oid, wallet_address: m.wallet, role: m.role, membership_status: "active" })), { onConflict: "organization_id,wallet_address" }), "members");
    const live = new Set(o.members.map((m) => m.wallet));
    const { data: have } = must(await db.from("organization_members").select("wallet_address").eq("organization_id", oid).eq("membership_status", "active"), "members.select");
    const gone = (have ?? []).map((r: any) => r.wallet_address).filter((w: string) => !live.has(w));
    if (gone.length) must(await db.from("organization_members").update({ membership_status: "removed" }).eq("organization_id", oid).in("wallet_address", gone), "members.remove");

    if (o.approvers.length) must(await db.from("organization_approvers").upsert(o.approvers.map((a) => ({ organization_id: oid, wallet_address: a, status: "active" })), { onConflict: "organization_id,wallet_address" }), "approvers");
    const liveA = new Set(o.approvers);
    const { data: haveA } = must(await db.from("organization_approvers").select("wallet_address").eq("organization_id", oid).eq("status", "active"), "approvers.select");
    const goneA = (haveA ?? []).map((r: any) => r.wallet_address).filter((w: string) => !liveA.has(w));
    if (goneA.length) must(await db.from("organization_approvers").update({ status: "removed" }).eq("organization_id", oid).in("wallet_address", goneA), "approvers.remove");
  }

  // 3. Noi dung ngoai chuoi. Nguon: (a) ban nhap moi gui, (b) noi dung da luu trong hang su kien (ban nhap bi xoa sau khi dung,
  //    nen KHONG co (b) thi lan dong bo sau se ghi de noi dung da xac minh bang null). Moi ung vien deu duoc kiem lai hash.
  //    Doc TRUOC buoc mirror cuoc bau cu: thiet lap hien thi (pham vi xem) phai duoc ghi cung luc voi hang cuoc bau cu, de RLS
  //    khong bao gio thay mot cuoc bau cu co noi dung ma chua co thiet lap (khong co khoang "ho").
  const { data: draftRows } = must(await db.from("metadata_history").select("id, metadata_type, metadata_hash, candidate_id_onchain, content, created_at")
    .eq("onchain_seen", false).order("created_at", { ascending: true }).limit(5000), "drafts");
  const drafts = (draftRows ?? []) as (Draft & { id: string })[];
  const { data: storedRows } = must(await db.from("metadata_history").select("metadata_type, metadata_hash, candidate_id_onchain, content")
    .eq("onchain_seen", true).not("content", "is", null).limit(20000), "stored");
  const pool: Draft[] = [...drafts, ...((storedRows ?? []) as Draft[])];

  // 4. Cuoc bau cu (mirror) kem pham vi xem lay tu noi dung da xac minh (khong xac minh duoc => nghiem ngat nhat)
  const visByElection = new Map<number, ReturnType<typeof visibilityOf>>();
  for (const e of snap.elections) {
    const c = pickVerified(pool, "election", null, e.metadataHash, hashOf);
    const ok = c && c.schema === "votechain.election.v1" && c.organizationId === e.orgId;
    visByElection.set(e.id, visibilityOf(ok ? c : null));
  }
  const mirror = buildMirrorRows(snap, orgUuid, (id) => visByElection.get(id)!);
  if (mirror.elections.length) must(await db.from("elections_chain").upsert(mirror.elections.map((e) => ({ ...e, synced_at: now })), { onConflict: "election_id_onchain" }), "elections_chain");

  const { electionsMeta, candidates } = buildContentRows(snap, pool, hashOf, orgUuid);
  if (electionsMeta.length) must(await db.from("elections_metadata").upsert(electionsMeta, { onConflict: "election_id_onchain" }), "elections_metadata");
  if (candidates.length) must(await db.from("candidates_metadata").upsert(candidates, { onConflict: "election_id_onchain,candidate_id_onchain" }), "candidates_metadata");

  // 5. Nhat ky phien ban theo su kien (moi (loai, cuoc bau cu, ung vien, phien ban) mot hang)
  const orgOfElection = new Map(snap.elections.map((e) => [e.id, orgUuid(e.orgId)]));
  const consumed: string[] = [];
  for (const ev of snap.events) {
    const organization_id = orgOfElection.get(ev.electionId); if (!organization_id) continue;
    const found = drafts.find((d) => d.metadata_type === ev.type && d.metadata_hash.toLowerCase() === ev.hash.toLowerCase() &&
      (d.candidate_id_onchain ?? null) === ev.candidateId && hashOf(d.content) === ev.hash.toLowerCase());
    let q = db.from("metadata_history").select("id, content").eq("onchain_seen", true).eq("metadata_type", ev.type).eq("election_id_onchain", ev.electionId).eq("metadata_version", ev.version);
    q = ev.candidateId === null ? q.is("candidate_id_onchain", null) : q.eq("candidate_id_onchain", ev.candidateId);
    const { data: ex } = must(await q.limit(1), "history.select");
    if (!ex?.length) {
      must(await db.from("metadata_history").insert({ organization_id, election_id_onchain: ev.electionId, candidate_id_onchain: ev.candidateId, metadata_type: ev.type,
        metadata_hash: ev.hash, metadata_version: ev.version, content: found?.content ?? null, content_valid: found ? true : null, transaction_hash: ev.txHash, onchain_seen: true }), "history.insert");
    } else if (!ex[0].content && found) {
      must(await db.from("metadata_history").update({ content: found.content, content_valid: true }).eq("id", ex[0].id), "history.update");
    }
    if (found) consumed.push(found.id);
  }

  // 6. Don ban nhap da duoc dung hoac qua cu
  if (consumed.length) must(await db.from("metadata_history").delete().in("id", consumed).eq("onchain_seen", false), "drafts.consumed");
  const cutoff = new Date(Date.now() - DRAFT_MAX_AGE_DAYS * 864e5).toISOString();
  must(await db.from("metadata_history").delete().eq("onchain_seen", false).lt("created_at", cutoff), "drafts.stale");
  await db.rpc("purge_expired_nonces");

  return { head: snap.head, organizations: snap.orgs.length, elections: snap.elections.length, events: snap.events.length };
}
