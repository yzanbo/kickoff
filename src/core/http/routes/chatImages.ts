import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { lookups } from "../lookups.js";
import { jsonBody } from "../input.js";

const hostSchema = z.string().trim().min(1).max(300);

/**
 * チャット欄の外の画像（メモの仕様書「0027_チャット欄の外の画像とリンク」）: 表示を許可したホストの一覧・許可・取り消しと、許可したホストの画像。
 * どれも端末には開かない（http/deviceAccess.ts の一覧に入れない）
 */
export function chatImageRoutes(app: Hono, { store, remoteImages }: ServerDeps) {
  const { withChat } = lookups(store);

  app.get("/api/chats/:id/image-hosts", withChat, (c) => c.json({ hosts: remoteImages.hosts(c.var.chat.id) }));

  app.put("/api/chats/:id/image-hosts", withChat, async (c) => {
    const { host } = z.object({ host: hostSchema }).parse(await jsonBody(c));
    return c.json({ hosts: remoteImages.allow(c.var.chat, host) });
  });

  app.delete("/api/chats/:id/image-hosts", withChat, async (c) => {
    const host = hostSchema.parse(c.req.query("host"));
    return c.json({ hosts: await remoteImages.revoke(c.var.chat, host) });
  });

  // 許可したホストの画像（コアが代わりに取る。2 回目からは覚えた画像を返す）。ページとして開かれても何も動かないよう sandbox の CSP を付ける
  app.get("/api/chats/:id/remote-image", withChat, async (c) => {
    const url = z.string().min(1).max(8192).parse(c.req.query("url"));
    const image = await remoteImages.image(c.var.chat, url);
    return c.body(new Uint8Array(image.body), 200, {
      "content-type": image.contentType,
      "content-security-policy": "sandbox",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=3600",
    });
  });
}
