/** Xoa URL (co the chua khoa API cua nha cung cap RPC) khoi thong bao loi truoc khi ghi log / luu. */
export function redact(message: unknown): string {
  return String(message ?? "unknown").replace(/https?:\/\/[^\s"')]+/g, "[url]").replace(/\s+/g, " ").slice(0, 300);
}
