// Doc trang thai VoteChain tu chuoi (OrganizationRegistry + ProjectCore) va doi thanh cac hang mirror cho Supabase.
// Thuan tuy (khong dung Deno / Supabase) de kiem thu duoc bang Hardhat. Nguon su that la HOP DONG; hang mirror chi la ban sao de truy van.
import { Contract, type Provider, getAddress } from "ethers";

export const REGISTRY_ABI = [
  "function organizationCount() view returns (uint256)",
  "function getOrganization(uint256) view returns (tuple(address owner,uint8 status,string name,bytes32 infoHash,uint256 createdAt,uint256 memberCount,uint256 approverCount))",
  "function getMembers(uint256) view returns (address[] addrs, uint8[] roles)",
  "function getApprovers(uint256) view returns (address[])",
];
export const CORE_ABI = [
  "function electionCount() view returns (uint256)",
  "function getElectionStats(uint256) view returns (uint256 regEnd,uint256 commitEnd,uint256 revealEnd,uint256 quorumBps,uint256 voterCount,uint256 revealedCount,uint256 requiredApprovals,uint256 approvalCount)",
  "function getElectionBasicInfo(uint256) view returns (address admin,string title,bool isActivated,bytes32 merkleRoot)",
  "function getElectionOrg(uint256) view returns (uint256 organizationId,uint256 createdAt,uint8 status,uint256 rejectCount,bytes32 metadataHash,uint256 metadataVersion)",
  "function getCandidates(uint256) view returns (string[])",
  "function getCandidateMetadata(uint256,uint256) view returns (bytes32 metadataHash,uint256 version)",
  "event ElectionMetadataSet(uint256 indexed id, uint256 version, bytes32 metadataHash)",
  "event CandidateMetadataSet(uint256 indexed id, uint256 indexed candidateId, uint256 version, bytes32 metadataHash)",
];

export const ORG_STATUS = ["None", "Pending", "Verified", "Suspended"] as const;
export const ROLE = ["None", "Member", "Proposer", "Manager"] as const;
export const REQUEST_STATUS = ["Pending", "Approved", "Rejected", "Withdrawn", "Expired"] as const;

export interface ChainSnapshot {
  orgs: { id: number; owner: string; status: string; name: string; infoHash: string; createdAt: number; members: { wallet: string; role: string }[]; approvers: string[] }[];
  elections: { id: number; orgId: number; proposer: string; createdAt: number; regEnd: number; commitEnd: number; revealEnd: number; requestStatus: string; candidates: string[]; metadataHash: string; metadataVersion: number; candidateMeta: { hash: string; version: number }[] }[];
  events: { type: "election" | "candidate"; electionId: number; candidateId: number | null; version: number; hash: string; txHash: string; block: number }[];
  head: number;
}

export async function readChain(provider: Provider, o: { registry: string; core: string; fromBlock: number; chunk?: number }): Promise<ChainSnapshot> {
  const reg = new Contract(o.registry, REGISTRY_ABI, provider);
  const core = new Contract(o.core, CORE_ABI, provider);
  const head = await provider.getBlockNumber();      // chot dau doan truoc khi doc, de khong bo sot su kien
  const snap: ChainSnapshot = { orgs: [], elections: [], events: [], head };

  const orgCount = Number(await reg.organizationCount());
  for (let id = 1; id <= orgCount; id++) {
    const v = await reg.getOrganization(id);
    const [addrs, roles] = await reg.getMembers(id);
    const approvers: string[] = await reg.getApprovers(id);
    snap.orgs.push({
      id, owner: String(v.owner).toLowerCase(), status: ORG_STATUS[Number(v.status)], name: v.name, infoHash: v.infoHash, createdAt: Number(v.createdAt),
      members: addrs.map((a: string, i: number) => ({ wallet: a.toLowerCase(), role: ROLE[Number(roles[i])] })),
      approvers: approvers.map((a) => a.toLowerCase()),
    });
  }

  const elCount = Number(await core.electionCount());
  for (let id = 0; id < elCount; id++) {
    const [stats, basic, org, names] = await Promise.all([core.getElectionStats(id), core.getElectionBasicInfo(id), core.getElectionOrg(id), core.getCandidates(id)]);
    const candidateMeta = [];
    for (let c = 0; c < names.length; c++) { const m = await core.getCandidateMetadata(id, c); candidateMeta.push({ hash: m.metadataHash, version: Number(m.version) }); }
    snap.elections.push({
      id, orgId: Number(org.organizationId), proposer: String(basic.admin).toLowerCase(), createdAt: Number(org.createdAt),
      regEnd: Number(stats.regEnd), commitEnd: Number(stats.commitEnd), revealEnd: Number(stats.revealEnd),
      requestStatus: REQUEST_STATUS[Number(org.status)], candidates: [...names], metadataHash: org.metadataHash, metadataVersion: Number(org.metadataVersion), candidateMeta,
    });
  }

  // Lich su phien ban tu su kien (giua fromBlock va head), chia khoang de khong vuot gioi han getLogs cua nha cung cap RPC.
  const step = o.chunk ?? 5000;
  for (let from = o.fromBlock; from <= head; from += step) {
    const to = Math.min(from + step - 1, head);
    for (const l of await core.queryFilter(core.filters.ElectionMetadataSet(), from, to) as any[])
      snap.events.push({ type: "election", electionId: Number(l.args.id), candidateId: null, version: Number(l.args.version), hash: l.args.metadataHash, txHash: l.transactionHash, block: l.blockNumber });
    for (const l of await core.queryFilter(core.filters.CandidateMetadataSet(), from, to) as any[])
      snap.events.push({ type: "candidate", electionId: Number(l.args.id), candidateId: Number(l.args.candidateId), version: Number(l.args.version), hash: l.args.metadataHash, txHash: l.transactionHash, block: l.blockNumber });
  }
  return snap;
}

const iso = (sec: number) => new Date(sec * 1000).toISOString();
const nfc = (s: unknown) => String(s ?? "").normalize("NFC").trim();

export interface Draft { metadata_type: "election" | "candidate"; metadata_hash: string; candidate_id_onchain: number | null; content: any }

/** Chon noi dung cho (loai, hash): chi nhan khi hash TINH LAI tu noi dung khop hash tren chuoi. */
export function pickVerified(drafts: Draft[], type: "election" | "candidate", candidateId: number | null, hash: string, hashOf: (o: unknown) => string | null): any | null {
  for (const d of drafts) {
    if (d.metadata_type !== type || String(d.metadata_hash).toLowerCase() !== hash.toLowerCase()) continue;
    if ((d.candidate_id_onchain ?? null) !== candidateId) continue;      // ung vien <=> co id, cuoc bau cu <=> null (khop rang buoc CSDL)
    if (hashOf(d.content) === hash.toLowerCase()) return d.content;
  }
  return null;
}

export type Scope = "public" | "internal" | "restricted";
export interface Visibility { info: Scope; candidates: Scope; results: Scope; roles: string[] }
const SCOPES: Scope[] = ["public", "internal", "restricted"];
const EXTRA_ROLES = ["Manager", "Proposer"];   // vai tro co the tich them o muc "hach che"; nguoi tao va dai dien duyet luon duoc xem
export const STRICT_VISIBILITY: Visibility = { info: "restricted", candidates: "restricted", results: "restricted", roles: [] };

/**
 * Thiet lap hien thi cua cuoc bau cu, lay tu noi dung DA XAC MINH hash.
 * - Chua co noi dung da xac minh (null): nghiem ngat nhat (an), vi chua biet nguoi tao muon gi.
 * - Noi dung khong co truong `visibility` (cuoc bau cu cu): cong khai, dung nhu truoc day.
 * - Gia tri sai / la: nghiem ngat nhat cho tung truong, khong bao gio mac dinh thanh cong khai.
 */
export function visibilityOf(content: any): Visibility {
  if (!content || typeof content !== "object") return { ...STRICT_VISIBILITY, roles: [] };
  const v = content.visibility;
  if (v === undefined || v === null) return { info: "public", candidates: "public", results: "public", roles: [] };
  if (typeof v !== "object" || Array.isArray(v)) return { ...STRICT_VISIBILITY, roles: [] };
  const pick = (x: unknown): Scope => (SCOPES.includes(x as Scope) ? (x as Scope) : "restricted");
  const roles = Array.isArray(v.roles) ? [...new Set((v.roles as unknown[]).filter((r): r is string => typeof r === "string" && EXTRA_ROLES.includes(r)))] : [];
  return { info: pick(v.info), candidates: pick(v.candidates), results: pick(v.results), roles };
}

/** Doi anh chup chuoi thanh hang mirror (khong chua noi dung ngoai chuoi). `visOf` (tuy chon) them thiet lap hien thi cho tung cuoc bau cu. */
export function buildMirrorRows(s: ChainSnapshot, orgUuid: (chainId: number) => string | undefined, visOf?: (electionId: number) => Visibility) {
  const organizations = s.orgs.map((o) => ({ organization_id_onchain: o.id, name: o.name, verification_status: o.status, created_by: o.owner, info_hash: o.infoHash, chain_created_at: iso(o.createdAt) }));
  const members = s.orgs.flatMap((o) => o.members.map((m) => ({ orgChainId: o.id, wallet_address: m.wallet, role: m.role })));
  const approvers = s.orgs.flatMap((o) => o.approvers.map((a) => ({ orgChainId: o.id, wallet_address: a })));
  const elections = s.elections.flatMap((e) => {
    const organization_id = orgUuid(e.orgId);
    if (!organization_id) return [];
    return [{ election_id_onchain: e.id, organization_id, proposer_wallet: e.proposer, created_at_chain: iso(e.createdAt), reg_end: iso(e.regEnd), commit_end: iso(e.commitEnd), reveal_end: iso(e.revealEnd),
      request_status: e.requestStatus, candidate_count: e.candidates.length, metadata_hash: e.metadataHash, metadata_version: e.metadataVersion,
      ...(visOf ? (({ info, candidates, results, roles }) => ({ info_visibility: info, candidate_visibility: candidates, results_visibility: results, restricted_roles: roles }))(visOf(e.id)) : {}) }];
  });
  return { organizations, members, approvers, elections };
}

/** Hang noi dung hien hanh cho cuoc bau cu va tung ung vien; `hashOf` tra null neu noi dung khong chuan hoa duoc. */
export function buildContentRows(s: ChainSnapshot, drafts: Draft[], hashOf: (o: unknown) => string | null, orgUuid: (chainId: number) => string | undefined) {
  const electionsMeta: any[] = [], candidates: any[] = [];
  for (const e of s.elections) {
    const organization_id = orgUuid(e.orgId); if (!organization_id) continue;
    const c = pickVerified(drafts, "election", null, e.metadataHash, hashOf);
    const ok = c && c.schema === "votechain.election.v1" && c.organizationId === e.orgId;   // noi dung phai khai dung to chuc so huu cuoc bau cu
    electionsMeta.push({ election_id_onchain: e.id, organization_id, metadata_hash: e.metadataHash, metadata_version: e.metadataVersion,
      status: ok ? "verified" : "awaiting_content",
      title: ok ? String(c.title ?? "") : null, description: ok ? String(c.description ?? "") : null,
      cover_image_url: ok && c.cover && typeof c.cover.url === "string" && /^https:\/\/\S+$/.test(c.cover.url) ? c.cover.url : null,
      election_metadata: ok ? c : null });
    e.candidates.forEach((name, idx) => {
      const m = e.candidateMeta[idx];
      const cc = pickVerified(drafts, "candidate", idx, m.hash, hashOf);
      const good = cc && cc.schema === "votechain.candidate.v1" && cc.index === idx;     // chong hoan doi ho so giua hai ung vien
      candidates.push({ election_id_onchain: e.id, candidate_id_onchain: idx, onchain_name: name, metadata_hash: m.hash, metadata_version: m.version,
        status: good ? "verified" : "awaiting_content",
        full_name: good ? String(cc.fullName ?? "") : null, name_matches_chain: good ? nfc(cc.fullName) === nfc(name) : null,
        avatar_url: good && cc.avatar && typeof cc.avatar.url === "string" && /^https:\/\/\S+$/.test(cc.avatar.url) ? cc.avatar.url : null,
        biography: good ? String(cc.bio ?? "") : null, experience: good ? String(cc.experience ?? "") : null,
        achievements: good ? String(cc.achievements ?? "") : null, manifesto: good ? String(cc.manifesto ?? "") : null,
        documents: good && Array.isArray(cc.documents) ? cc.documents : [] });
    });
  }
  return { electionsMeta, candidates };
}

export const normalizeAddress = (a: string) => getAddress(a).toLowerCase();
