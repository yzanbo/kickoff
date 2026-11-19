// 端末のトークンを呼び主にする口（土台の認証 DeviceAuth の実装）。端末は devices の店（トークンは hash で引く）、スマホ連携のオンは設定
import type { Store } from "@/foundation/core/db/store";
import type { DeviceAuth } from "@/foundation/core/http/auth";

export function deviceAuth(store: Pick<Store, "devices" | "settings">): DeviceAuth {
  return {
    authenticate: (token) => {
      const device = store.devices.byToken(token);
      if (!device) return null;
      if (!store.settings.get().remote_enabled) return "mobile_off";
      return { kind: "device", deviceId: device.id, readOnly: device.access !== "full" };
    },
    touched: (deviceId) => store.devices.touch(deviceId),
    alive: (deviceId) => store.settings.get().remote_enabled && store.devices.get(deviceId) !== null,
  };
}
