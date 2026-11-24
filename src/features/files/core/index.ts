// ファイルの機能のコアの入口（ほかの機能はここだけを読む）
import type { FileContent, SavedFile } from "@shared/foundation/fileTypes";
import type { CoreFeature } from "@/foundation/core/feature";
import type { TrashApi } from "@/features/trash/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import type { ProjectsApi } from "@/features/projects/core/index";
import type { Kernel } from "@/foundation/core/kernel";
import { readProjectFile, writeProjectFile } from "./files";
import { filesRoutes } from "./routes/files";
import { openFileToolGroup } from "./tools";

export { chatWorkplace, openFileToolGroup, workPathIn } from "./tools";

/** ほかの機能が使うファイルの口（dir は作業場所のフォルダ、path はその中の相対パス） */
export interface FilesApi {
  readProjectFile(dir: string, path: string): Promise<FileContent>;
  /** baseHash は開いたときの指紋（いまの中身と違えば 409。null なら確かめずに上書き） */
  writeProjectFile(dir: string, path: string, content: string, baseHash: string | null): Promise<SavedFile>;
}

/** プロジェクトのファイル（木・開く・保存・検索・置換。消したファイルはゴミ箱へ） */
export function createFiles(k: Kernel, deps: { trash: TrashApi; projects: Pick<ProjectsApi, "param">; chat: Pick<ChatApi, "store"> }): CoreFeature<FilesApi> {
  return {
    name: "files",
    api: { readProjectFile, writeProjectFile },
    routes: [filesRoutes({ projectParam: deps.projects.param, trashBin: deps.trash })],
    aiTools: [openFileToolGroup({ store: deps.chat.store, publish: (e) => k.bus.publish(e) })],
  };
}
