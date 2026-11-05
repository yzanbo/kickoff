// ウィンドウの間の知らせ（メインのウィンドウと別ウィンドウ。同じ出どころなので BroadcastChannel で届く）
import type { FileTarget } from "./router";

export type WindowMessage =
  /** メインのウィンドウのそのチャットのチャット欄の後ろに足す（別ウィンドウの差分の行・返答へのコメント） */
  | { type: "fillComposer"; chatId: number; text: string }
  /** メインのウィンドウのそのチャットの会話のその場所へ移る（agent があれば、そのサブエージェントを設定の開き方で開いてその中へ） */
  | { type: "reveal"; chatId: number; eventId?: number; agent: string | null }
  /** メインのウィンドウのそのチャットの「動き」を、そのサブエージェントに絞って開く */
  | { type: "showActivity"; chatId: number; agent: string }
  /** メインのウィンドウでエディタタブのファイルを開く */
  | { type: "openProjectFile"; projectId: number; file: FileTarget }
  /** もう開いている別ウィンドウの「変更」を、そのファイルの位置へ移す（key は popoutKey） */
  | { type: "popoutFocus"; key: string; focus: string };

// 画面（ブラウザ）の中だけで作る（テストの Node で作ると、開いたままで終わらなくなる）
const channel = typeof window === "undefined" || typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel("kickoff-windows");
const listeners = new Set<(message: WindowMessage) => void>();
channel?.addEventListener("message", (e: MessageEvent<WindowMessage>) => {
  for (const listener of [...listeners]) listener(e.data);
});

/** ほかのウィンドウに知らせる（自分のウィンドウには届かない） */
export function postWindowMessage(message: WindowMessage) {
  channel?.postMessage(message);
}

/** メインのウィンドウに知らせて、前に出す（別ウィンドウから、メインの会話・チャット欄・エディタタブを動かすとき） */
export function postToMainWindow(message: WindowMessage) {
  postWindowMessage(message);
  void window.kickoff?.windows.focusMain();
}

/** ほかのウィンドウからの知らせを受け取る（やめるときは返り値を呼ぶ） */
export function subscribeWindowMessages(listener: (message: WindowMessage) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
