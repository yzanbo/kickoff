import type { ChatEvent, ChatEventOf } from "@shared/types";

/**
 * 会話を引き継げる、いちばん近い作業の終わり（end より前。省けば最後まで）。巻き戻し・子チャットの起点。
 * 最後まで終わった作業の終わり（session_id と message_id があるもの）だけを数え、止めた・失敗した作業の終わりは飛ばす
 * （最後のメッセージがセッションに残っていないことがある）。間にコンテキストの消去（context_cleared）があれば、
 * それより前の会話は引き継がないので undefined（最初から始める）
 */
export function resumePointBefore(events: ChatEvent[], end = events.length): ChatEventOf<"result">["data"] | undefined {
  for (let i = Math.min(end, events.length) - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "context_cleared") return undefined;
    if (e.type === "result" && e.data.status === "completed" && e.data.session_id && e.data.message_id) return e.data;
  }
  return undefined;
}

/**
 * index の記録（自分の発言）を送ったときのセッション（ファイルを戻すときの、ファイルの記録があるセッション）。
 * あとでコンテキストを消去していれば、消去の直前に使っていたセッション（なければ null）、消去していなければいまのセッション（current）
 */
export function sessionAt(events: ChatEvent[], index: number, current: string | null): string | null {
  const cleared = events.findIndex((e, i) => i > index && e.type === "context_cleared");
  if (cleared < 0) return current;
  for (let i = cleared - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "init") return e.data.session_id;
  }
  return null;
}
