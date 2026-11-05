// Dinh danh "nguoi goi" cho viec gioi han tan suat: bam SHA-256 cua IP (khong luu IP goc). Thuan tuy, kiem thu duoc bang Node.
export function clientIp(h: { get(name: string): string | null }): string | null {
  const direct = h.get("cf-connecting-ip") ?? h.get("x-real-ip");
  const fwd = h.get("x-forwarded-for")?.split(",")[0];
  const ip = (direct ?? fwd ?? "").trim();
  return ip && ip.length <= 64 && /^[0-9a-fA-F:.]+$/.test(ip) ? ip.toLowerCase() : null;
}

export async function requesterHash(ip: string | null, salt: string): Promise<string | null> {
  if (!ip) return null;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}`));
  return Array.from(new Uint8Array(d).slice(0, 16), (x) => x.toString(16).padStart(2, "0")).join("");   // 32 hex
}
