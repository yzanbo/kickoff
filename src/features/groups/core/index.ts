// グループの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import { groupRoutes } from "./routes/groups";

export { requireGroupOf } from "./requireGroup";

/** チャットのグループのルート（下の機能 projects の口はまだ使わない） */
export function createGroups(k: KernelWithStore): CoreFeature<null> {
  return { name: "groups", api: null, routes: [{ legacy: (app) => groupRoutes(app, { store: k.store }) }] };
}
