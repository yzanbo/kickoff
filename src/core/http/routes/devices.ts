import type { Hono } from "hono";
import { z } from "zod";
import type { PairingClaimBody, ViewingBody } from "@shared/types";
import { callerOf } from "../caller.js";
import { DEVICE_NAME_MAX } from "../../devices/pairing.js";
import type { ServerDeps } from "../server.js";
import { idParam, jsonBody } from "../input.js";

const claimSchema = z.object({ code: z.string().trim().min(1).max(20), name: z.string().max(200) }) satisfies z.ZodType<PairingClaimBody>;
const pollSchema = z.object({ secret: z.string().min(1).max(200) });
const viewingSchema = z.object({ chat_id: z.number().int().positive().nullable(), ci_project_id: z.number().int().positive().nullable() }) satisfies z.ZodType<ViewingBody>;

/**
 * スマホ連携の端末とペアリング。この Mac の画面だけが使う口（/api/pairing・/api/devices。端末には開かない = deviceAccess.ts）と、
 * まだトークンを持たない端末が使う口（/pairing/…。認証の外。番号と、頼んだ端末だけが知る鍵で守る）
 */
export function deviceRoutes(app: Hono, { pairing, store, viewing }: ServerDeps) {
  // いま見ているもの（この Mac の画面も端末も。だれかが見ているチャット・CI のタブの知らせは通知しない = notifications/center.ts）
  app.put("/api/viewing", async (c) => {
    viewing.report(callerOf(c), viewingSchema.parse(await jsonBody(c)));
    return c.body(null, 204);
  });

  // ---- この Mac の画面 ----
  app.get("/api/pairing", (c) => c.json(pairing.state()));
  // 新しい番号を出す（前の番号は捨てる）
  app.post("/api/pairing", (c) => c.json(pairing.start()));
  app.delete("/api/pairing", (c) => c.json(pairing.cancel()));
  app.post("/api/pairing/requests/:id/approve", (c) => c.json(pairing.approve(c.req.param("id"))));
  app.post("/api/pairing/requests/:id/deny", (c) => c.json(pairing.deny(c.req.param("id"))));
  app.get("/api/devices", (c) => c.json(store.devices.list()));
  app.delete("/api/devices/:id", (c) => {
    pairing.revoke(idParam(c));
    return c.body(null, 204);
  });
}

/** まだトークンを持たない端末の口（認証のミドルウェアより前・/api の外に登録する） */
export function pairingClaimRoutes(app: Hono, { pairing }: Pick<ServerDeps, "pairing">) {
  // 番号でつなぎたいと頼む → 頼みの ID と、結果を聞く鍵（201）
  app.post("/pairing/claim", async (c) => {
    const { code, name } = claimSchema.parse(await jsonBody(c));
    return c.json(pairing.claim(code, name.slice(0, DEVICE_NAME_MAX)), 201);
  });
  // 結果を聞く（つないだら端末のトークンを 1 回だけ渡す）
  app.post("/pairing/requests/:id", async (c) => {
    const { secret } = pollSchema.parse(await jsonBody(c));
    return c.json(pairing.poll(c.req.param("id"), secret));
  });
}
