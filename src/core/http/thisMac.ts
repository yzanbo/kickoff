// この Mac からの頼みだけを受ける口（DB クライアント・GitHub タブ。LAN は暗号化なしの HTTP なので、読むだけでも中身が流れるため）
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

/** この Mac からの頼みか（127.0.0.1・::1。node-server の受けた接続の相手。テストのように接続がなければ通す） */
export function fromThisMac(c: Context) {
  const address = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress;
  return address === undefined || address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/** この Mac からでなければ 403（message は断るときの文） */
export const localOnly = (message: string) =>
  createMiddleware(async (c, next) => {
    if (!fromThisMac(c)) return c.json({ error: message }, 403);
    await next();
  });
