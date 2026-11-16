import type { BusEvent, ChatEvent } from "@shared/types";

/**
 * 書いている途中の返答（SSE の chat_delta）を消す、メインエージェントの記録の種類。
 * どのプロバイダーも、途中の文のあとに次のまとまり（文・思考・ツール）か作業の終わり・失敗の記録を出す（確定した文は記録に入る）
 */
const CLEARING_TYPES: ReadonlySet<ChatEvent["type"]> = new Set(["text", "thinking", "tool_use", "tool_result", "result", "error"]);

/** 知らせが、そのチャットの書いている途中の返答に何をするか */
export type StreamingEffect = { chatId: number; effect: "append"; text: string } | { chatId: number; effect: "clear" };

/**
 * 知らせが、書いている途中の返答に何をするか（足す / 消す / 何もしない = null）。パソコンの画面とスマホのアプリで同じ決まりにする。
 * 消すのは、メインエージェント（parent のない）の文・思考・ツールの呼び出しと結果、作業の終わり・失敗、巻き戻し（chat_events_deleted）、作業中でなくなったとき。
 * サブエージェントの記録（parent あり）・裏のサブエージェントの終わり（subagent。parent を持たない）・お知らせ・承認・圧縮・init・渡した記録・
 * コンテキストの消去・自分の発言では消さない（返答の途中に届いても、メインエージェントの文は続いているため。メモの仕様書「0023_表示を軽くする」の U12）
 */
export function streamingEffectOf(event: BusEvent): StreamingEffect | null {
  switch (event.type) {
    case "chat_delta":
      return { chatId: event.chat_id, effect: "append", text: event.text };
    case "chat_event": {
      const e = event.event;
      if (!CLEARING_TYPES.has(e.type) || ("parent" in e.data && e.data.parent)) return null;
      return { chatId: e.chat_id, effect: "clear" };
    }
    case "chat_events_deleted":
      return { chatId: event.chat_id, effect: "clear" };
    case "chat":
      return event.chat.status === "running" ? null : { chatId: event.chat.id, effect: "clear" };
    default:
      return null;
  }
}
