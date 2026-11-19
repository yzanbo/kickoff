// ファイルの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { TrashApi } from "@/features/trash/core/index";
import { filesRoutes } from "./routes/files";

/** プロジェクトのファイル（木・開く・保存・検索・置換。消したファイルはゴミ箱へ） */
export function createFiles(k: KernelWithStore, deps: { trash: TrashApi }): CoreFeature<null> {
  return { name: "files", api: null, routes: [{ legacy: (app) => filesRoutes(app, { store: k.store, trashBin: deps.trash }) }] };
}
