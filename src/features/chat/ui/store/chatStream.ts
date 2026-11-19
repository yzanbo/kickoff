// チャットの店の、書いている途中の返答の当て方（chatStore.ts が使う）
import type { BusEvent } from "@shared/types";
import { streamingAppendOf, streamingEffectOf, type StreamingEffect } from "@shared/chat/streamingRules";
import { STREAM_FLUSH_MS, type ChatStoreDeps, type Entry } from "./chatStoreTypes";

/**
 * 届いた分はためて、見え方ごとの間隔（STREAM_FLUSH_MS）で当てる。消すとき（確定した返答が記録に入った・巻き戻し・作業中でなくなった）は
 * 途中の文の購読者に知らせず、世代 gen を進めて前の文を retired に残すだけにし、記録の口の差し替えで streamGen を進める
 */
export function createStreamOps(deps: Pick<ChatStoreDeps, "timer" | "now" | "windowHidden">, notifyStreaming: (e: Entry) => void, markLog: (e: Entry) => void) {
  const flushInterval = (e: Entry) =>
    deps.windowHidden() ? STREAM_FLUSH_MS.windowHidden : [...e.viewers.values()].includes("visible") ? STREAM_FLUSH_MS.visible : STREAM_FLUSH_MS.hidden;

  const flush = (e: Entry) => {
    const s = e.stream;
    s.cancel?.();
    s.cancel = null;
    if (!s.pending) return;
    s.text += s.pending;
    s.pending = "";
    notifyStreaming(e);
  };

  /** 消す（世代を進める）。部品に見せている世代の文は retired に残し、記録の口の差し替えで streamGen を進める */
  const clear = (e: Entry) => {
    const s = e.stream;
    s.cancel?.();
    s.cancel = null;
    s.pending = "";
    if (!s.text) return;
    if (e.published.log.streamGen === s.gen) s.retired = { gen: s.gen, text: s.text };
    s.gen++;
    s.text = "";
    markLog(e);
  };

  const apply = (e: Entry, effect: StreamingEffect) => {
    if (effect.effect === "clear") return clear(e);
    const s = e.stream;
    const add = streamingAppendOf(s.text.length + s.pending.length, effect.text, effect.offset);
    if (!add) return;
    s.pending += add;
    s.lastAt = new Date(deps.now()).toISOString();
    s.cancel ??= deps.timer(() => flush(e), flushInterval(e));
  };

  /** 詳細の書きかけの返答から始め、読み込みの最中に届いた知らせを当て直す（詳細の文に入っている分は offset で捨てる） */
  const seed = (e: Entry, text: string | null, missed: readonly BusEvent[]) => {
    const s = e.stream;
    if (text === null || !text.startsWith(s.text)) clear(e);
    if (text) {
      s.cancel?.();
      s.cancel = null;
      s.text = text;
      s.pending = "";
    }
    for (const event of missed) {
      const effect = streamingEffectOf(event);
      if (effect?.chatId === e.chatId) apply(e, effect);
    }
    flush(e);
    notifyStreaming(e);
  };

  return { flush, clear, apply, seed };
}
