// サイドバーの別ウィンドウへ、メインのウィンドウのパネルの状態を写す（下書きの行・子チャットの行の「開いている」見た目は、メインのウィンドウのパネルから決めるため）。
// 変える操作は写しの側で行わず、メインのウィンドウに頼む（forwardPanelOp → app/mainWindowMessages.ts）
import { isSidebarWindow } from "@/app/popout";
import { postToMainWindow, postWindowMessage, subscribeWindowMessages, type PanelOp, type WindowMessage } from "@/app/windowBus";
import { allPanels, replacePanels, setPanelReplica, subscribePanels } from "./panelStore";

/** 続けて変わったときに 1 回にまとめる間（メインのウィンドウが裏にあっても止まらないよう、rAF ではなく時計で） */
const SEND_DELAY_MS = 50;

/** 写しの知らせ（いまのすべての欄の状態） */
const panelsMessage = (): WindowMessage => ({ type: "mainPanels", panels: [...allPanels()] });

/** メインのウィンドウ: いまの写しを送り、パネルが変わるたびに（まとめて）送り直す。やめるときは返り値を呼ぶ */
export function sendPanelsWhileChanging(post: (message: WindowMessage) => void = postWindowMessage): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const send = () => {
    timer = undefined;
    post(panelsMessage());
  };
  send();
  const off = subscribePanels(() => {
    timer ??= setTimeout(send, SEND_DELAY_MS);
  });
  return () => {
    off();
    clearTimeout(timer);
  };
}

/** サイドバーの別ウィンドウ: このウィンドウの店を写しにして（届くまでは空）、メインのウィンドウから届いた写しを入れる。やめるときは返り値を呼ぶ */
export function followMainPanels(): () => void {
  setPanelReplica(true);
  replacePanels([]);
  const off = subscribeWindowMessages((m) => {
    if (m.type === "mainPanels") replacePanels(m.panels);
  });
  return () => {
    off();
    setPanelReplica(false);
  };
}

/**
 * サイドバーの別ウィンドウの中なら、パネルを変える操作をメインのウィンドウに頼んで true を返す（呼んだ側はそこで終える）。
 * 開く操作（focusMain）はメインのウィンドウを前にも出す
 */
export function forwardPanelOp(op: PanelOp, { focusMain = false }: { focusMain?: boolean } = {}): boolean {
  if (!isSidebarWindow()) return false;
  (focusMain ? postToMainWindow : postWindowMessage)({ type: "panelOp", op });
  return true;
}
