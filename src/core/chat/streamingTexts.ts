import type { BusEvent } from "@shared/types";
import { streamingEffectOf } from "@shared/chat/streamingRules";

/**
 * チャットごとの書きかけの返答（SSE で送った chat_delta をつないだもの）。チャットの詳細（GET /api/chats/:id）の streaming_text に入れ、
 * 返答の途中で開いた画面・スマホが、文の頭から出せるようにする（メモの仕様書「0023_表示を軽くする」の M1・分冊 1 の 2-5）。
 * バスが流す知らせ（16ms のまとめのあと）を順に見て持つので、持っている文は SSE で送った文とちょうど同じになる。
 * 送る chat_delta には、書きかけの文の中で始まる位置（offset）を付け、受ける側は持っている分と重なった所を捨てる（詳細の文と、行き違いで届く途中の文が二重にならない）。
 * 消す決まりは画面・スマホと同じ streamingEffectOf（メインエージェントの次の記録・作業の終わり・巻き戻し・作業中でなくなったとき）
 */
export class StreamingTexts {
  private readonly texts = new Map<number, string>();

  /** 流す知らせを見て、書きかけの文を足す・消す。chat_delta は位置 offset を付けたものを返す（ほかはそのまま） */
  track(event: BusEvent): BusEvent {
    if (event.type === "chat_deleted") {
      this.texts.delete(event.id);
      return event;
    }
    const effect = streamingEffectOf(event);
    if (!effect) return event;
    if (effect.effect === "clear") {
      this.texts.delete(effect.chatId);
      return event;
    }
    const before = this.texts.get(effect.chatId) ?? "";
    this.texts.set(effect.chatId, before + effect.text);
    return event.type === "chat_delta" ? { ...event, offset: before.length } : event;
  }

  /** いまの書きかけの文（なければ null） */
  textOf(chatId: number): string | null {
    return this.texts.get(chatId) ?? null;
  }
}
