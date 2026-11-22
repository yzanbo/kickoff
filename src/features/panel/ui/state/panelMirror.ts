// サイドバーの別ウィンドウの中では、パネルを変える操作をそのウィンドウで行わず、メインのウィンドウに頼む（受け口は app/renderer/mainWindowMessages.ts）。
// サイドバーの別ウィンドウが読むパネルの値（下書きの行・子チャットの行の「開いている」見た目）は、メインのウィンドウからの写し（chatPanel の panelFollow.ts）
import { isSidebarWindow } from "@/foundation/ui/navigation/popout";
import { postToMainWindow, postWindowMessage, type WindowMessageMap } from "@/foundation/ui/navigation/windowBus";

/**
 * サイドバーの別ウィンドウの中なら、パネルを変える操作をメインのウィンドウに頼んで true を返す（呼んだ側はそこで終える）。
 * 開く操作（focusMain）はメインのウィンドウを前にも出す
 */
export function forwardPanelOp(op: WindowMessageMap["panelOp"], { focusMain = false }: { focusMain?: boolean } = {}): boolean {
  if (!isSidebarWindow()) return false;
  (focusMain ? postToMainWindow : postWindowMessage)("panelOp", op);
  return true;
}
