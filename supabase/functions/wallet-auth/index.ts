// Edge Function wallet-auth: dang nhap Supabase bang chu ky vi (khong mat khau).
//
//   POST { action: "nonce",  wallet }                      -> { nonce, message, issuedAt, expiresAt }
//   POST { action: "verify", wallet, nonce, signature }     -> { token_hash, type }  roi client goi supabase.auth.verifyOtp({ token_hash, type })
//
// An toan:
//  * Thong diep ky duoc DUNG LAI tu hang nonce server luu (domain, chainId, nonce, thoi han): client khong tu chon duoc.
//  * Nonce chi dung MOT lan: consume_wallet_nonce la mot UPDATE nguyen tu (chong replay, chong goi song song).
//  * Chu ky sai khong "dot" nonce cua nguoi khac (chi tieu thu sau khi chu ky hop le).
//  * Vi dinh danh nam o app_metadata.wallet (chi service_role ghi duoc), khong dung user_metadata.
//  * service_role chi nam trong bien moi truong cua Edge Function (Supabase tu cap), khong bao gio o frontend.
import { createClient } from "@supabase/supabase-js";
import { getAddress } from "ethers";
import { redact } from "../_shared/redact.ts";
import { corsFor, HttpError, readJson, reply } from "../_shared/http.ts";
import { clientIp, requesterHash } from "../_shared/requester.ts";
import { buildLoginMessage, NONCE_RE, randomNonce, SIG_RE, signatureMatches, walletEmail, WALLET_RE } from "../_shared/siwe.ts";

const NONCE_TTL_SECONDS = 300;
const MAX_RECENT_NONCES = 10;      // so nonce con hieu luc toi da cho moi vi
const MAX_NONCES_PER_REQUESTER = 5; // so nonce moi nguoi goi (IP) duoc cap cho mot vi trong 1 phut

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
  try {
    if (!cors.ok) throw new HttpError(403, "Origin khong duoc phep");
    if (req.method !== "POST") throw new HttpError(405, "Chi ho tro POST");

    const domain = Deno.env.get("SITE_DOMAIN");
    const chainId = Number(Deno.env.get("CHAIN_ID") ?? "11155111");
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!domain || !url || !key) throw new HttpError(500, "May chu chua duoc cau hinh");
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    const body = await readJson(req);
    const wallet = typeof body.wallet === "string" && WALLET_RE.test(body.wallet) ? body.wallet.toLowerCase() : null;
    if (!wallet) throw new HttpError(400, "Dia chi vi khong hop le");

    if (body.action === "nonce") {
      const nonce = randomNonce();
      const requester = await requesterHash(clientIp(req.headers), Deno.env.get("RATE_LIMIT_SALT") ?? Deno.env.get("SYNC_SECRET") ?? "");
      const { data, error } = await db.rpc("issue_wallet_nonce", { p_wallet: wallet, p_nonce: nonce, p_ttl_seconds: NONCE_TTL_SECONDS, p_max_recent: MAX_RECENT_NONCES,
        p_requester: requester, p_max_per_requester: MAX_NONCES_PER_REQUESTER });
      if (error) {
        if (error.code === "54000") throw new HttpError(429, "Qua nhieu yeu cau, thu lai sau it phut");
        throw error;
      }
      const row = data as { issued_at: string; expires_at: string };
      const fields = { domain, wallet: getAddress(wallet), nonce, issuedAt: new Date(row.issued_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(), chainId };
      return reply(200, { nonce, message: buildLoginMessage(fields), issuedAt: fields.issuedAt, expiresAt: fields.expiresAt }, cors.headers);
    }

    if (body.action === "verify") {
      const nonce = typeof body.nonce === "string" && NONCE_RE.test(body.nonce) ? body.nonce : null;
      const signature = typeof body.signature === "string" && SIG_RE.test(body.signature) ? body.signature : null;
      if (!nonce || !signature) throw new HttpError(400, "Thieu nonce hoac chu ky hop le");

      // 1. Doc hang nonce (chua tieu thu) de dung lai dung thong diep da phat.
      const { data: row, error: e1 } = await db.from("auth_nonces").select("issued_at, expires_at, used_at")
        .eq("wallet_address", wallet).eq("nonce", nonce).maybeSingle();
      if (e1) throw e1;
      if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) throw new HttpError(401, "Nonce khong hop le hoac da het han");
      const message = buildLoginMessage({ domain, wallet: getAddress(wallet), nonce, issuedAt: new Date(row.issued_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(), chainId });

      // 2. Chu ky phai la cua dung vi.
      if (!signatureMatches(message, signature, wallet)) throw new HttpError(401, "Chu ky khong hop le");

      // 3. Tieu thu nonce nguyen tu: neu mot request khac vua dung roi thi that bai (replay / song song).
      const { data: used, error: e2 } = await db.rpc("consume_wallet_nonce", { p_wallet: wallet, p_nonce: nonce });
      if (e2) throw e2;
      if (!Array.isArray(used) || used.length !== 1) throw new HttpError(401, "Nonce khong hop le hoac da het han");

      // 4. Dam bao co user gan voi vi, roi tao token_hash dung mot lan de client doi lay phien that.
      const email = walletEmail(wallet);
      const created = await db.auth.admin.createUser({ email, email_confirm: true, app_metadata: { wallet, provider: "wallet" } });
      if (created.error && !/already|registered|exists/i.test(created.error.message)) throw created.error;
      const link = await db.auth.admin.generateLink({ type: "magiclink", email });
      if (link.error || !link.data?.properties?.hashed_token) throw link.error ?? new Error("generateLink that bai");
      const user = link.data.user;
      if (user && user.app_metadata?.wallet !== wallet) {
        const up = await db.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, wallet, provider: "wallet" } });
        if (up.error) throw up.error;
      }
      return reply(200, { token_hash: link.data.properties.hashed_token, type: "magiclink" }, cors.headers);
    }

    throw new HttpError(400, "action khong hop le");
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.publicMessage }, cors.headers);
    console.error("wallet-auth error:", redact((e as Error)?.message));   // khong log body / chu ky / khoa
    return reply(500, { error: "Loi may chu" }, cors.headers);
  }
});
