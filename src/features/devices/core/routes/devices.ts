// スマホ連携の受け口（取り決め @shared/devices/contract.ts）。この Mac の画面だけが使う口（/api/pairing・/api/devices）と、
// まだトークンを持たない端末が使う口（/pairing/…。認証の外。番号と、頼んだ端末だけが知る鍵で守る）と、端末が自分を読む・宛先を登録する口
import { z } from "zod";
import { devicesContract } from "@shared/devices/contract";
import { DEVICE_ACCESSES, type DevicePush, type DevicePushBody, type DeviceUpdateBody, type PairingApproveBody, type PairingClaimBody, type PairingPollBody } from "@shared/devices/types";
import type { Caller } from "@/foundation/core/http/caller";
import { Invalid, NotFound } from "@/foundation/core/errors";
import { implement, type Param } from "@/foundation/core/http/implement";
import { parseId } from "@/foundation/core/http/input";
import type { Bus } from "@/foundation/core/bus";
import { DEVICE_NAME_MAX, type PairingCenter } from "@/features/devices/core/pairing";
import type { DeviceStore } from "@/features/devices/core/db/devices";
import { tailscaleStatus } from "@/features/devices/core/tailscale";

const claimSchema = z.object({ code: z.string().trim().min(1).max(20), name: z.string().max(200) }) satisfies z.ZodType<PairingClaimBody>;
const pollSchema = z.object({ secret: z.string().min(1).max(200) }) satisfies z.ZodType<PairingPollBody>;
/** プッシュの宛先（Expo のトークン・Web Push の購読） */
const pushSchema = z.union([
  z.object({ kind: z.literal("expo"), token: z.string().min(1).max(500) }),
  z.object({ kind: z.literal("web"), endpoint: z.url({ protocol: /^https$/ }).max(2000), keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }) }),
]) satisfies z.ZodType<DevicePush>;
const pushBodySchema = z.object({ push: pushSchema.nullable() }) satisfies z.ZodType<DevicePushBody>;
const accessSchema = z.enum(DEVICE_ACCESSES);
const approveSchema = z.object({ access: accessSchema.optional() }) satisfies z.ZodType<PairingApproveBody>;
const updateSchema = z.object({ access: accessSchema }) satisfies z.ZodType<DeviceUpdateBody>;

/** パスの番号・文字をそのまま受ける（端末・頼みがあるかは中身が確かめる = 本文の確かめが先） */
const deviceIdParam: Param<number> = { parse: parseId };
const requestIdParam: Param<string> = { parse: (raw) => raw };

/** 端末だけの口の呼び主（この Mac の画面は端末ではないので 400） */
function deviceCaller(caller: Caller, message: string): Extract<Caller, { kind: "device" }> {
  if (caller.kind !== "device") throw new Invalid(message);
  return caller;
}

export interface DeviceRouteDeps {
  pairing: PairingCenter;
  devices: DeviceStore;
  bus: Bus;
  tailscaleCli: () => string | null;
  /** 待ち受けているアドレス（ポート 0 = テストなら、頼みの URL のポート） */
  listen?: { host: string; port: number };
}

export function deviceRoutes({ pairing, devices, bus, tailscaleCli, listen }: DeviceRouteDeps) {
  return implement(devicesContract, {
    context: { requestId: requestIdParam, deviceId: deviceIdParam },
    // ---- まだトークンを持たない端末（認証の外） ----
    "POST /pairing/claim": {
      body: claimSchema,
      run: ({ body }) => pairing.claim(body.code, body.name.slice(0, DEVICE_NAME_MAX)),
    },
    "POST /pairing/requests/:requestId": {
      body: pollSchema,
      run: ({ requestId, body }) => pairing.poll(requestId, body.secret),
    },
    // ---- 端末 ----
    "GET /api/devices/self": {
      run: ({ caller }) => {
        const device = devices.get(deviceCaller(caller, "つないだ端末から読む口です").deviceId);
        if (!device) throw new NotFound("端末が見つかりません");
        return device;
      },
    },
    // 宛先は外に出さない（Device は has_push だけ）
    "PUT /api/devices/self/push": {
      body: pushBodySchema,
      run: ({ caller, body }) => {
        devices.setPush(deviceCaller(caller, "プッシュの宛先は、つないだ端末が自分で登録します").deviceId, body.push);
      },
    },
    // ---- この Mac の画面 ----
    "GET /api/pairing": { run: () => pairing.state() },
    "POST /api/pairing": { run: () => pairing.start() },
    "DELETE /api/pairing": { run: () => pairing.cancel() },
    "POST /api/pairing/requests/:requestId/approve": {
      body: approveSchema,
      run: ({ requestId, body }) => pairing.approve(requestId, body.access),
    },
    "POST /api/pairing/requests/:requestId/deny": { run: ({ requestId }) => pairing.deny(requestId) },
    "GET /api/devices": { run: () => devices.list() },
    "GET /api/tailscale": {
      run: ({ raw: c }) => tailscaleStatus(tailscaleCli(), listen?.port ?? Number(new URL(c.req.url).port || 80)),
    },
    "PATCH /api/devices/:deviceId": {
      body: updateSchema,
      run: ({ deviceId, body }) => {
        const device = devices.setAccess(deviceId, body.access);
        if (!device) throw new NotFound("端末が見つかりません");
        bus.publish({ type: "devices" });
        return device;
      },
    },
    "DELETE /api/devices/:deviceId": { run: ({ deviceId }) => pairing.revoke(deviceId) },
  });
}
