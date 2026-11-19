// スマホ連携の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { DeviceAuth } from "@/foundation/core/http/auth";
import type { KernelWithStore } from "@/foundation/core/kernel";
import { deviceAuth } from "./auth";
import { PairingCenter } from "./pairing";
import { deviceRoutes, pairingClaimRoutes } from "./routes/devices";

export interface DevicesEnv {
  /** tailscale のコマンドの場所（入っていなければ null。設定の Tailscale Serve の案内） */
  tailscaleCli: () => string | null;
  /** ペアリングの番号の期限の時計（省けば本物の時計） */
  pairingNow?: () => number;
}

export interface DevicesApi {
  /** 端末のトークンを呼び主にする（土台の認証が使う） */
  auth: DeviceAuth;
  /** スマホ連携がオンか */
  mobileEnabled(): boolean;
  /** ペアリング（番号と頼みはメモリだけ） */
  pairing: PairingCenter;
}

/** スマホ連携（ペアリング・端末・Tailscale の案内）。まだトークンを持たない端末の口は認証の外 */
export function createDevices(k: KernelWithStore, env: DevicesEnv): CoreFeature<DevicesApi> {
  const pairing = new PairingCenter({ store: k.store, publish: (e) => k.bus.publish(e), now: env.pairingNow });
  // ポート 0（テスト。待ち受けない）なら、頼みの URL のポート
  const listen = k.paths.port ? { host: k.paths.host, port: k.paths.port } : undefined;
  return {
    name: "devices",
    api: { auth: deviceAuth(k.store), mobileEnabled: () => k.settings.get().remote_enabled, pairing },
    routes: [
      { access: "public", legacy: (app) => pairingClaimRoutes(app, { pairing }) },
      { legacy: (app) => deviceRoutes(app, { pairing, store: k.store, bus: k.bus, tailscaleCli: env.tailscaleCli, listen }) },
    ],
  };
}
