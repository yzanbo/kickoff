import { dialog, type OpenDialogOptions } from "electron";
import type { IpcHandlers } from "../ipc/register.js";

/** ネイティブのファイル・フォルダの選択（やめたら空） */
export async function pickPaths(options: OpenDialogOptions): Promise<string[]> {
  const result = await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

/** ネイティブのダイアログ（IPC の dialog） */
export const dialogHandlers: IpcHandlers["dialog"] = {
  // macOS の窓は title を出さないので、説明（message。省けば title）を窓の上に出す
  pickFolder: async (_e, title = "フォルダを選択", options = {}) => {
    const [folder] = await pickPaths({
      properties: ["openDirectory", "createDirectory"],
      title,
      message: options.message ?? title,
      ...(options.buttonLabel ? { buttonLabel: options.buttonLabel } : {}),
      ...(options.defaultPath ? { defaultPath: options.defaultPath } : {}),
    });
    return folder ?? null;
  },
  // 参照資料を選ぶ（フォルダもファイルも、複数まとめて選べる）
  pickReferences: () =>
    pickPaths({ properties: ["openFile", "openDirectory", "multiSelections"], title: "参照資料にするフォルダ・ファイルを選択", buttonLabel: "追加" }),
};
