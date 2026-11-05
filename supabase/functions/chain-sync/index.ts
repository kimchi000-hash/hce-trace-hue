// Edge Function chain-sync: dong bo trang thai tu hop dong (Registry + ProjectCore) vao bang mirror Supabase.
//
// Goi boi: (a) nguoi dung da dang nhap (sau khi tao to chuc / cuoc bau cu / doi hash) hoac (b) cron kem header x-sync-secret.
// Quy tac:
//  * Chuoi la nguon su that. Bang mirror chi la ban sao de truy van; moi ghi vao mirror deu qua ham nay (service_role).
//  * Noi dung ngoai chuoi (tieu de, tieu su...) chi duoc "xac minh" khi keccak256(chuan hoa JSON) == hash tren chuoi.
//  * Gioi han tan suat qua sync_state de khong bi dung lam kenh spam RPC.
import { createClient } from "@supabase/supabase-js";
import { JsonRpcProvider } from "ethers";
import { redact } from "../_shared/redact.ts";
import { corsFor, HttpError, reply } from "../_shared/http.ts";
import { runSync } from "../_shared/sync.ts";
import { timingSafeEqual } from "../_shared/siwe.ts";

const MIN_INTERVAL_MS = Number(Deno.env.get("SYNC_MIN_INTERVAL_SECONDS") ?? "15") * 1000;

const must = <T extends { error: unknown }>(r: T, what: string): T => { if (r.error) throw new Error(`${what}: ${(r.error as any).message}`); return r; };

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
  try {
    if (!cors.ok) throw new HttpError(403, "Origin khong duoc phep");
    if (req.method !== "POST") throw new HttpError(405, "Chi ho tro POST");

    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const rpc = Deno.env.get("RPC_URL"), registry = Deno.env.get("REGISTRY_ADDRESS"), core = Deno.env.get("CORE_ADDRESS");
    const deployBlock = Number(Deno.env.get("DEPLOY_BLOCK") ?? "0");
    if (!url || !key || !rpc || !registry || !core) throw new HttpError(503, "Dong bo chua duoc cau hinh (RPC_URL, REGISTRY_ADDRESS, CORE_ADDRESS)");
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    // --- Xac thuc: bi mat cron HOAC nguoi dung da dang nhap (khong nhan khoa anon/publishable).
    const secret = Deno.env.get("SYNC_SECRET"), given = req.headers.get("x-sync-secret");
    const bySecret = !!secret && !!given && timingSafeEqual(given, secret);
    if (!bySecret) {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data, error } = token ? await db.auth.getUser(token) : { data: null, error: new Error("no token") };
      if (error || !data?.user?.app_metadata?.wallet) throw new HttpError(401, "Can dang nhap bang vi");
    }

    // --- Gioi han tan suat + chiem luot chay (nguyen tu, tranh hai lan dong bo chay chong nhau)
    const threshold = new Date(Date.now() - MIN_INTERVAL_MS).toISOString();
    const claim = await db.from("sync_state").update({ last_run_at: new Date().toISOString() }).eq("id", 1)
      .or(`last_run_at.is.null,last_run_at.lt.${threshold}`).select("last_block");
    must(claim, "sync_state");
    if (!claim.data?.length) return reply(200, { skipped: true, reason: "vua dong bo xong" }, cors.headers);
    const lastBlock = Number(claim.data[0].last_block);

    try {
      const r = await runSync(db, new JsonRpcProvider(rpc), { registry, core, deployBlock, lastBlock, chainId: Number(Deno.env.get("CHAIN_ID") ?? "11155111") });
      must(await db.from("sync_state").update({ last_block: r.head, last_error: null }).eq("id", 1), "sync_state.done");
      return reply(200, { ok: true, ...r }, cors.headers);
    } catch (e) {
      await db.from("sync_state").update({ last_error: redact((e as Error).message) }).eq("id", 1);
      throw e;
    }
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.publicMessage }, cors.headers);
    console.error("chain-sync error:", redact((e as Error)?.message));
    return reply(500, { error: "Loi may chu" }, cors.headers);
  }
});
