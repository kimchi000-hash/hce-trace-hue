// Ban TypeScript cua scripts/metadata.js: PHAI cho ra hash y het (co test doi chieu trong test/SupabaseFunctions.test.js).
import { keccak256, toUtf8Bytes } from "ethers";

export function canonicalize(v: unknown): string {
  if (v === null) return "null";
  switch (typeof v) {
    case "boolean": return v ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(v)) throw new Error("metadata chi nhan so nguyen an toan");
      return String(v);
    case "string": return JSON.stringify(v.normalize("NFC"));
    case "object": {
      if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o).map((k) => [k.normalize("NFC"), k] as [string, string])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      for (let i = 1; i < keys.length; i++) if (keys[i][0] === keys[i - 1][0]) throw new Error("khoa bi trung sau khi chuan hoa");
      return "{" + keys.map(([nk, k]) => JSON.stringify(nk) + ":" + canonicalize(o[k])).join(",") + "}";
    }
    default: throw new Error("metadata khong ho tro kieu " + typeof v);
  }
}

export const metadataHash = (obj: unknown): string => keccak256(toUtf8Bytes(canonicalize(obj)));

export function hashMatches(obj: unknown, expected: string): boolean {
  try { return metadataHash(obj) === String(expected).toLowerCase(); } catch { return false; }
}
