// ファイルの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { TrashApi } from "@/features/trash/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import type { Kernel } from "@/foundation/core/kernel";
import { filesRoutes } from "./routes/files";
import { openFileToolGroup } from "./tools";

export { chatWorkplace, openFileToolGroup, workPathIn } from "./tools";

/** プロジェクトのファイル（木・開く・保存・検索・置換。消したファイルはゴミ箱へ） */
export function createFiles(k: Kernel, deps: { trash: TrashApi; chat: Pick<ChatApi, "store"> }): CoreFeature<null> {
  return {
    name: "files",
    api: null,
    routes: [{ legacy: (app) => filesRoutes(app, { store: deps.chat.store, trashBin: deps.trash }) }],
    aiTools: [openFileToolGroup({ store: deps.chat.store, publish: (e) => k.bus.publish(e) })],
  };
}
