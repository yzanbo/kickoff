// スマホ連携の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { DeviceAuth } from "@/foundation/core/http/auth";
import type { Kernel } from "@/foundation/core/kernel";
import { deviceAuth } from "./auth";
import { createDeviceStore, type DeviceStore } from "./db/devices";
import { PairingCenter } from "./pairing";
import { deviceRoutes } from "./routes/devices";

export interface DevicesEnv {
  /** tailscale のコマンドの場所（入っていなければ null。設定の Tailscale Serve の案内） */
  tailscaleCli: () => string | null;
  /** ペアリングの番号の期限の時計（省けば本物の時計） */
  pairingNow?: () => number;
}

export interface DevicesApi {
  /** つないだ端末の店（通知のプッシュ・ターミナルの端末の権限が読む） */
  store: DeviceStore;
  /** 端末のトークンを呼び主にする（土台の認証が使う） */
  auth: DeviceAuth;
  /** スマホ連携がオンか */
  mobileEnabled(): boolean;
  /** ペアリング（番号と頼みはメモリだけ） */
  pairing: PairingCenter;
}

/** スマホ連携（ペアリング・端末・Tailscale の案内）。まだトークンを持たない端末の口は認証の外 */
export function createDevices(k: Kernel, env: DevicesEnv): CoreFeature<DevicesApi> {
  const devices = createDeviceStore(k.db);
  const pairing = new PairingCenter({ devices, settings: k.settings, hostId: k.paths.databaseId, publish: (e) => k.bus.publish(e), now: env.pairingNow });
  // ポート 0（テスト。待ち受けない）なら、頼みの URL のポート
  const listen = k.paths.port ? { host: k.paths.host, port: k.paths.port } : undefined;
  return {
    name: "devices",
    api: { store: devices, auth: deviceAuth({ devices, settings: k.settings }), mobileEnabled: () => k.settings.get().mobile_enabled, pairing },
    routes: [deviceRoutes({ pairing, devices, bus: k.bus, tailscaleCli: env.tailscaleCli, listen })],
  };
}
