import { webContents } from "electron";
import type { IpcHandlers } from "@/foundation/desktop/ipc/register";
import { isOurWebview } from "./browser";

/** 画面の右クリックの項目のうち、webview の要素からは呼べないもの */
export const browserContextHandlers: IpcHandlers["browser"] = {
  copyImageAt: (e, id, x, y) => {
    const guest = webContents.fromId(id);
    if (!isOurWebview(e.sender, guest)) throw new Error("画像をコピーできるブラウザのタブがありません");
    guest.copyImageAt(x, y);
  },
};
