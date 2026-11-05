// CORS theo danh sach origin cho phep (bien moi truong ALLOWED_ORIGINS), tra loi JSON, loi chung chung (khong ro stack).
export function allowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function corsFor(req: Request): { ok: boolean; headers: Record<string, string> } {
  const origin = req.headers.get("origin");
  const list = allowedOrigins();
  const base = { "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey, x-sync-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (!origin) return { ok: true, headers: base };                    // goi tu may chu / cron (khong phai trinh duyet)
  if (list.length === 0 || !list.includes(origin)) return { ok: false, headers: base }; // chua cau hinh => tu choi trinh duyet
  return { ok: true, headers: { ...base, "Access-Control-Allow-Origin": origin } };
}

export function reply(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export class HttpError extends Error {
  constructor(public status: number, public publicMessage: string) { super(publicMessage); }
}

/** Doc JSON toi da 8 KB. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 8192) throw new HttpError(413, "Yeu cau qua lon");
  try {
    const v = JSON.parse(text);
    if (v === null || typeof v !== "object" || Array.isArray(v)) throw 0;
    return v as Record<string, unknown>;
  } catch { throw new HttpError(400, "Noi dung khong phai JSON hop le"); }
}

