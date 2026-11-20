// ウィンドウの間の知らせ（メインのウィンドウと別ウィンドウ。同じ出どころなので BroadcastChannel で届く）。
// 知らせの種類と中身は、持ち主（機能の ui/windowMessages.ts・土台は使うファイル）が declare module で WindowMessageMap に足す
import { createSignal, type Signal } from "@/foundation/ui/store";

/** 機能が足していく知らせの表（キーが種類、値が中身。中身はウィンドウをまたげる値だけ） */
export interface WindowMessageMap {}
type WindowMessageType = keyof WindowMessageMap & string;

/** 知らせを運ぶ口（BroadcastChannel と同じ形。テストは偽物を渡す） */
interface WindowChannel {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (e: MessageEvent<{ type: string; payload: unknown }>) => void): void;
}

/** 送る口と受ける口を作る（送る形は { type, payload }。届いたら種類ごとの知らせに配る。channel がなければ送らず届かない） */
export function createWindowBus(channel: WindowChannel | undefined) {
  const signals = new Map<string, Signal<unknown>>();
  channel?.addEventListener("message", (e) => signals.get(e.data.type)?.emit(e.data.payload));
  return {
    post<K extends WindowMessageType>(type: K, payload: WindowMessageMap[K]): void {
      channel?.postMessage({ type, payload });
    },
    on<K extends WindowMessageType>(type: K, handler: (payload: WindowMessageMap[K]) => void): () => void {
      let signal = signals.get(type);
      if (!signal) signals.set(type, (signal = createSignal<unknown>()));
      return signal.subscribe(handler as (payload: unknown) => void);
    },
  };
}

// 画面（ブラウザ）の中だけで作る（テストの Node で作ると、開いたままで終わらなくなる）
const bus = createWindowBus(typeof window === "undefined" || typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel("kickoff-windows"));

/** ほかのウィンドウに知らせる（自分のウィンドウには届かない） */
export function postWindowMessage<K extends WindowMessageType>(type: K, payload: WindowMessageMap[K]): void {
  bus.post(type, payload);
}

/** メインのウィンドウに知らせて、前に出す（別ウィンドウから、メインの会話・チャット欄・ファイルタブを動かすとき） */
export function postToMainWindow<K extends WindowMessageType>(type: K, payload: WindowMessageMap[K]): void {
  bus.post(type, payload);
  void window.kickoff?.windows.focusMain();
}

/** ほかのウィンドウからのその種類の知らせを受け取る（やめるときは返り値を呼ぶ） */
export function onWindowMessage<K extends WindowMessageType>(type: K, handler: (payload: WindowMessageMap[K]) => void): () => void {
  return bus.on(type, handler);
}
