// チャットからメモを、設定の開き方（MEMO_OPEN_IN）で開く: 右の欄 = そのチャット（子チャットなら、いちばん上の親）の画面の右の欄のタブ /
// 別ウィンドウ。チャットが分からなければメモのタブ。別ウィンドウの中から右の欄に開くときは、メインのウィンドウに頼む
import { canPopout, openPopout, parsePopout } from "@/app/popout";
import { openMemo } from "@/app/router";
import { postToMainWindow } from "@/app/windowBus";
import { MEMO_OPEN_IN } from "@/lib/storageKeys";
import { readSetting } from "@/lib/storage";
import { openInRootSide } from "@/features/chat/children/openChild";
import { baseName } from "./memoPaths";

export function openMemoFromChat({ projectId, path, chatId, place }: { projectId: number; path: string; chatId: number | null; place?: "side" | "window" }) {
  // place を渡すと設定によらずその場所に（入力欄の上のメモの一覧の行のボタン）
  if ((place ?? readSetting(MEMO_OPEN_IN)) === "window" && canPopout()) return openPopout({ kind: "memo", projectId, path, ...(chatId !== null ? { chatId } : {}) }, `${baseName(path)} — メモ`);
  if (parsePopout(location.hash)) return postToMainWindow({ type: "openMemo", projectId, path, chatId });
  if (chatId !== null && openInRootSide(chatId, (rootId, side) => side.openMemo({ chatId: rootId, projectId, path }))) return;
  openMemo(projectId, path);
}
