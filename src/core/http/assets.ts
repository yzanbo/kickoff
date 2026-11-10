// HTML のページ（メモ・ファイルのプレビュー）が相対パスで読むファイルを返す口の補助（Content-Type・パスの解き方・応答）
import path from "node:path";
import type { Context } from "hono";
import { Invalid } from "./errors.js";

/** HTML のページが読むファイルの種類（拡張子 → Content-Type。ほかは application/octet-stream） */
const ASSET_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

/** URL のパスを 1 段ずつ解く（解けなければ 400。段の中の / は許さない） */
export function decodeSegments(raw: string): string {
  try {
    const parts = raw.split("/").map(decodeURIComponent);
    if (parts.some((p) => p.includes("/"))) throw new Error();
    return parts.join("/");
  } catch {
    throw new Invalid("パスが正しくありません");
  }
}

/** ファイルの中身をそのまま返す（ページとして開かれても何も動かないよう sandbox の CSP を付け、いつも取り直させる） */
export function assetResponse(c: Context, file: string, data: Buffer) {
  const ext = path.posix.extname(file).toLowerCase();
  return c.body(new Uint8Array(data), 200, {
    "Content-Type": ASSET_TYPES[ext] ?? "application/octet-stream",
    "Content-Security-Policy": "sandbox",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache",
  });
}
