// チャットからメモを、設定の開き方（MEMO_OPEN_IN）で開く: 右の欄 = そのチャット（子チャットなら、いちばん上の親）の画面の右の欄のタブ /
// 別ウィンドウ。送る前の新しいチャット（draftSide）なら、その下書きのタブの右の欄。チャットが分からない・メモのチャットならメモのタブ。
// 別ウィンドウの中から右の欄に開くときは、メインのウィンドウに頼む
import { canPopout, openPopout, parsePopout } from "@/app/popout";
import { openMemo } from "@/app/router";
import { postToMainWindow } from "@/app/windowBus";
import { MEMO_OPEN_IN } from "@/lib/storageKeys";
import { readSetting } from "@/lib/storage";
import { knownChat } from "@/stores/chats";
import { openInRootSide } from "@/features/chat/children/openChild";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelKey, type DraftScope } from "@/features/panel/surfaces";
import { baseName } from "./memoPaths";

export function openMemoFromChat({
  projectId,
  path,
  chatId,
  place,
  draftSide = null,
}: {
  projectId: number;
  path: string;
  chatId: number | null;
  place?: "side" | "window";
  /** 送る前の新しいチャットの右の欄（DraftSideContext。チャットがまだないので、そのタブの右の欄に開く） */
  draftSide?: DraftScope | null;
}) {
  // place を渡すと設定によらずその場所に（入力欄の上のメモの一覧の行のボタン）
  if ((place ?? readSetting(MEMO_OPEN_IN)) === "window" && canPopout()) return openPopout({ kind: "memo", projectId, path, ...(chatId !== null ? { chatId } : {}) }, `${baseName(path)} — メモ`);
  if (chatId === null && draftSide !== null) return panelActions(panelKey("agents", draftSide)).openMemo({ chatId: null, projectId, path });
  if (parsePopout(location.hash)) return postToMainWindow({ type: "openMemo", projectId, path, chatId });
  // メモのチャット（メモのタブの中で開いたもの）からは、メモのタブで開く（メモのチャットは右の欄を持たない）
  const from = chatId !== null && !knownChat(chatId)?.memo_path ? chatId : null;
  if (from !== null && openInRootSide(from, (rootId, side) => side.openMemo({ chatId: rootId, projectId, path }))) return;
  openMemo(projectId, path);
}

/** メモのタブでそのメモを開く（DB クライアントの手順メモのタブの「メモのタブで開く」。別ウィンドウの中からはメインのウィンドウに頼む） */
export function openInMemoTab(projectId: number, path: string) {
  if (parsePopout(location.hash)) return postToMainWindow({ type: "openMemo", projectId, path, chatId: null });
  openMemo(projectId, path);
}
