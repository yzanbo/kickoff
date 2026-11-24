import { randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Codex の PreToolUse フック（hooks.ts）が問い合わせる口。1 回の実行ごとに 127.0.0.1 の空いたポートで開き、
 * その実行の鍵（32 バイトの乱数）を持つ頼みだけに答える。答えは判定の JSON か、何も言わない（空 = 通す）。
 * 承認カードの答えを待つ間は接続を開いたまま（Node の頼みの待ち時間の上限は外す）
 */

/** 開いた口（終わったら close） */
export interface HookServer {
  url: string;
  token: string;
  close(): void;
}

/** 頼みの本文の上限（コマンド・パッチの文。大きすぎるものは断る） */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const sameToken = (header: string | undefined, token: string): boolean => {
  const given = Buffer.from(header?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "");
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
};

/** 口を開く（handler は届いた入力から答えを作る。投げたら 500 = フックは断る答えを出す） */
export function startHookServer(handler: (input: unknown) => Promise<object | null>): Promise<HookServer> {
  const token = randomBytes(32).toString("base64url");
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || !sameToken(req.headers.authorization, token)) {
      res.writeHead(401).end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) req.destroy();
      else chunks.push(chunk);
    });
    req.on("end", () => {
      void (async () => {
        try {
          const answer = await handler(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          res.writeHead(200, { "content-type": "application/json" }).end(answer ? JSON.stringify(answer) : "");
        } catch {
          res.writeHead(500).end();
        }
      })();
    });
  });
  // 承認カードの答えを待つ間、頼みを時間で切らない
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        token,
        close: () => {
          server.closeAllConnections();
          server.close();
        },
      });
    });
  });
}
