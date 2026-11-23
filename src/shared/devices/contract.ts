// スマホ連携の取り決め（受け口は src/features/devices/core/routes/devices.ts）。まだトークンを持たない端末の口（/pairing/…）は認証の外、
// 端末が自分を読む・プッシュの宛先を登録する口は端末に開き、ペアリング・端末の一覧・Tailscale はこの Mac の画面だけ
import { empty, route, type Contract } from "@shared/foundation/contract";
import type { TailscaleStatus } from "./tailscale";
import type { Device, DevicePushBody, DeviceUpdateBody, PairingApproveBody, PairingClaimBody, PairingClaimResult, PairingPollBody, PairingPollResult, PairingState } from "./types";

export const devicesContract = {
  /** 番号でつなぎたいと頼む → 頼みの ID と、結果を聞く鍵（認証の外。番号と、頼んだ端末だけが知る鍵で守る） */
  "POST /pairing/claim": route<PairingClaimBody, PairingClaimResult>({ status: 201, access: "public" }),
  /** 結果を聞く（つないだら端末のトークンを 1 回だけ渡す。頼みがない・鍵が合わなければ expired） */
  "POST /pairing/requests/:requestId": route<PairingPollBody, PairingPollResult>({ access: "public" }),
  /** 端末が自分（名前・できること）を読む（この Mac の画面は端末ではないので 400） */
  "GET /api/devices/self": route<never, Device>({ access: "device" }),
  /** 端末が自分のプッシュの宛先を登録する・外す（null。この Mac の画面からは 400。見るだけの端末も使える） */
  "PUT /api/devices/self/push": empty<DevicePushBody>({ access: "deviceRead" }),
  /** ペアリングの様子 */
  "GET /api/pairing": route<never, PairingState>(),
  /** 新しい番号を出す（前の番号は捨てる。スマホ連携がオフなら 409） */
  "POST /api/pairing": route<never, PairingState>(),
  /** やめる（番号と、確かめを待っている頼みを捨てる） */
  "DELETE /api/pairing": route<never, PairingState>(),
  /** 確かめを待っている頼みを「つなぐ」 */
  "POST /api/pairing/requests/:requestId/approve": route<PairingApproveBody, PairingState>(),
  /** 確かめを待っている頼みを「断る」（番号はそのまま） */
  "POST /api/pairing/requests/:requestId/deny": route<never, PairingState>(),
  /** つないだ端末（つないだ順） */
  "GET /api/devices": route<never, Device[]>(),
  /** この Mac の Tailscale の様子（入っているか・つながっているか・この本体のポートへの Serve の URL・始めるコマンド） */
  "GET /api/tailscale": route<never, TailscaleStatus>(),
  /** できることを変える（次の頼みから効く） */
  "PATCH /api/devices/:deviceId": route<DeviceUpdateBody, Device>(),
  /** 取り消す（そのトークンはすぐ使えなくなる） */
  "DELETE /api/devices/:deviceId": empty(),
} as const satisfies Contract;
