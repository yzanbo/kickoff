// コアが外の画像を取りに行くとき、行き先にしない IP アドレス（この Mac の中・手元のネットワーク・クラウドのメタデータなど）の見分け
import net from "node:net";

/** IPv4 の 32 ビットの数（読めなければ null） */
function ipv4Number(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** 断る IPv4 の範囲（先頭のアドレスとマスクの長さ） */
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], // この機械
  ["10.0.0.0", 8], // 手元のネットワーク
  ["100.64.0.0", 10], // 通信会社の中のアドレス（Tailscale もここ）
  ["127.0.0.0", 8], // ループバック
  ["169.254.0.0", 16], // リンクローカル（クラウドのメタデータ 169.254.169.254 も）
  ["172.16.0.0", 12], // 手元のネットワーク
  ["192.0.0.0", 24], // 予約
  ["192.168.0.0", 16], // 手元のネットワーク
  ["198.18.0.0", 15], // 試験用
  ["224.0.0.0", 3], // マルチキャストと予約（224〜255）
];

function blockedV4(ip: string): boolean {
  const n = ipv4Number(ip);
  if (n === null) return true;
  return BLOCKED_V4.some(([base, bits]) => {
    const b = ipv4Number(base)!;
    const size = 2 ** (32 - bits);
    return n >= b && n < b + size;
  });
}

function blockedV6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  // IPv4 を写した形（::ffff:a.b.c.d・::a.b.c.d）は IPv4 として見る
  const mapped = lower.match(/^(?:::ffff:|::)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return blockedV4(mapped[1]);
  if (lower === "::" || lower === "::1") return true;
  const head = parseInt(lower.split(":")[0] || "0", 16);
  if (Number.isNaN(head)) return true;
  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 手元のネットワーク
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 リンクローカル
  if ((head & 0xff00) === 0xff00) return true; // ff00::/8 マルチキャスト
  return false;
}

/** 外の画像を取りに行く行き先にしないアドレスか（読めないものも断る） */
export function isBlockedAddress(ip: string): boolean {
  const kind = net.isIP(ip.replace(/^\[|\]$/g, ""));
  if (kind === 4) return blockedV4(ip);
  if (kind === 6) return blockedV6(ip);
  return true;
}
