// バイナリの応答（ファイル・画像・音声）の見出しを 1 か所に: ページとして開かれても何も動かない sandbox の CSP・種類の推測をさせない・キャッシュ
import type { Context } from "hono";

/** 取り決めの blob の受け口が返すもの */
export interface FileReply {
  bytes: Uint8Array<ArrayBuffer>;
  /** Content-Type */
  type: string;
  /** Cache-Control（既定 no-cache = いつも取り直させる） */
  cache?: string;
  /** そのほかの見出し */
  headers?: Record<string, string>;
}

/** ファイルの中身をそのまま返す */
export function fileResponse(c: Context, reply: FileReply): Response {
  return c.body(reply.bytes, 200, {
    "Content-Type": reply.type,
    "Content-Security-Policy": "sandbox",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": reply.cache ?? "no-cache",
    ...reply.headers,
  });
}
