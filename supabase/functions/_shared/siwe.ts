// Thong diep dang nhap bang vi (kieu EIP-4361 rut gon) + xac minh chu ky. Chi dung ethers.verifyMessage (khong tu viet crypto).
import { getAddress, verifyMessage } from "ethers";

export const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
export const NONCE_RE = /^[0-9a-f]{32}$/;
export const SIG_RE = /^0x[0-9a-fA-F]{130}$/;

export interface LoginFields {
  domain: string;      // ten mien trang web (chong dung lai chu ky cho trang khac)
  wallet: string;      // dia chi checksum
  nonce: string;
  issuedAt: string;    // ISO
  expiresAt: string;   // ISO
  chainId: number;
}

/** Thong diep CHI duoc dung tu du lieu server da luu: client khong the tu chon noi dung. */
export function buildLoginMessage(f: LoginFields): string {
  return [
    `${f.domain} yeu cau ban dang nhap VoteChain bang vi:`,
    getAddress(f.wallet),
    "",
    "Chu ky nay chi dung de chung minh ban so huu vi. Khong ton gas, khong cap quyen chuyen tai san.",
    "",
    `Domain: ${f.domain}`,
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
    `Expiration Time: ${f.expiresAt}`,
  ].join("\n");
}

/** true neu `signature` la chu ky cua `wallet` tren `message`. Khong nem loi cho chu ky hong. */
export function signatureMatches(message: string, signature: string, wallet: string): boolean {
  try { return verifyMessage(message, signature).toLowerCase() === wallet.toLowerCase(); } catch { return false; }
}

export const walletEmail = (wallet: string) => `${wallet.toLowerCase()}@wallet.votechain.local`;

export function randomNonce(): string {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let d = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) d |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return d === 0;
}
