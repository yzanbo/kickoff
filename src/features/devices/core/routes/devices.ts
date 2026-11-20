import type { Hono } from "hono";
import { z } from "zod";
import { DEVICE_ACCESSES, type DevicePush, type DeviceUpdateBody, type PairingApproveBody, type PairingClaimBody } from "@shared/devices/types";
import { Invalid, NotFound } from "@/foundation/core/errors";
import { callerOf } from "@/foundation/core/http/caller";
import { DEVICE_NAME_MAX, type PairingCenter } from "@/features/devices/core/pairing";
import type { Bus } from "@/foundation/core/bus";
import type { Store } from "@/foundation/core/db/store";
import { idParam, jsonBody } from "@/foundation/core/http/input";
import { tailscaleStatus } from "@/features/devices/core/tailscale";

const claimSchema = z.object({ code: z.string().trim().min(1).max(20), name: z.string().max(200) }) satisfies z.ZodType<PairingClaimBody>;
const pollSchema = z.object({ secret: z.string().min(1).max(200) });
/** プッシュの宛先（Expo のトークン・Web Push の購読） */
const pushSchema = z.union([
  z.object({ kind: z.literal("expo"), token: z.string().min(1).max(500) }),
  z.object({ kind: z.literal("web"), endpoint: z.url({ protocol: /^https$/ }).max(2000), keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }) }),
]) satisfies z.ZodType<DevicePush>;
const pushBodySchema = z.object({ push: pushSchema.nullable() });
const accessSchema = z.enum(DEVICE_ACCESSES);
const approveSchema = z.object({ access: accessSchema.optional() }) satisfies z.ZodType<PairingApproveBody>;
const updateSchema = z.object({ access: accessSchema }) satisfies z.ZodType<DeviceUpdateBody>;

/**
 * スマホ連携の端末とペアリング。この Mac の画面だけが使う口（/api/pairing・/api/devices。端末には開かない = deviceAccess.ts）と、
 * まだトークンを持たない端末が使う口（/pairing/…。認証の外。番号と、頼んだ端末だけが知る鍵で守る）
 */
export function deviceRoutes(
  app: Hono,
  { pairing, store, bus, tailscaleCli, listen }: { pairing: PairingCenter; store: Store; bus: Bus; tailscaleCli: () => string | null; listen?: { host: string; port: number } },
) {
  // 端末が自分（名前・できること）を読む（この Mac の画面は端末ではないので 400）
  app.get("/api/devices/self", (c) => {
    const caller = callerOf(c);
    if (caller.kind !== "device") throw new Invalid("つないだ端末から読む口です");
    const device = store.devices.get(caller.deviceId);
    if (!device) throw new NotFound("端末が見つかりません");
    return c.json(device);
  });
  // 端末が自分のプッシュの宛先を登録する・外す（null）。この Mac の画面は端末ではないので 400。宛先は外に出さない（Device は has_push だけ）
  app.put("/api/devices/self/push", async (c) => {
    const caller = callerOf(c);
    if (caller.kind !== "device") throw new Invalid("プッシュの宛先は、つないだ端末が自分で登録します");
    const { push } = pushBodySchema.parse(await jsonBody(c));
    store.devices.setPush(caller.deviceId, push);
    return c.body(null, 204);
  });

  // ---- この Mac の画面 ----
  app.get("/api/pairing", (c) => c.json(pairing.state()));
  // 新しい番号を出す（前の番号は捨てる）
  app.post("/api/pairing", (c) => c.json(pairing.start()));
  app.delete("/api/pairing", (c) => c.json(pairing.cancel()));
  app.post("/api/pairing/requests/:id/approve", async (c) => {
    const { access } = approveSchema.parse(await jsonBody(c));
    return c.json(pairing.approve(c.req.param("id"), access));
  });
  app.post("/api/pairing/requests/:id/deny", (c) => c.json(pairing.deny(c.req.param("id"))));
  app.get("/api/devices", (c) => c.json(store.devices.list()));
  // この Mac の Tailscale の様子（入っているか・つながっているか・この本体のポートへの Serve の URL・始めるコマンド）
  app.get("/api/tailscale", async (c) => c.json(await tailscaleStatus(tailscaleCli(), listen?.port ?? Number(new URL(c.req.url).port || 80))));
  // できることを変える（次の頼みから効く）
  app.patch("/api/devices/:id", async (c) => {
    const { access } = updateSchema.parse(await jsonBody(c));
    const device = store.devices.setAccess(idParam(c), access);
    if (!device) throw new NotFound("端末が見つかりません");
    bus.publish({ type: "devices" });
    return c.json(device);
  });
  app.delete("/api/devices/:id", (c) => {
    pairing.revoke(idParam(c));
    return c.body(null, 204);
  });
}

/** まだトークンを持たない端末の口（認証のミドルウェアより前・/api の外に登録する） */
export function pairingClaimRoutes(app: Hono, { pairing }: { pairing: PairingCenter }) {
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
