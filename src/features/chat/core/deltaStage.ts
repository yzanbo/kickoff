import type { BusInput } from "@shared/types";
import type { BusStage } from "@/foundation/core/bus";
import type { Clock } from "@/foundation/core/clock";
import { DeltaBatch } from "./deltaBatch";
import { StreamingTexts } from "./streamingTexts";

/**
 * 書いている途中の返答の段（コアの Bus に登録する）。chat_delta はチャットごとに 16ms ためて 1 通にまとめ、ほかの知らせより必ず先に流す（DeltaBatch）。
 * 流した途中の返答はチャットごとにつないで持ち（チャットの詳細の streaming_text）、chat_delta に書きかけの文の中の位置 offset を付ける（StreamingTexts）
 */
export function chatDeltaStage(clock: Pick<Clock, "setTimeout" | "clearTimeout">): BusStage & { streamingText(chatId: number): string | null } {
  // ためた分を配る口（Bus が accept のたびに同じものを渡す。ためるのは accept のあとなので、流すときにはいつも決まっている）
  let emit: (event: BusInput) => void = () => {};
  const batch = new DeltaBatch((event) => emit(event), clock);
  const texts = new StreamingTexts();
  return {
    accept(event, later) {
      emit = later;
      return batch.accept(event);
    },
    track: (event) => texts.track(event),
    flush: () => batch.flush(),
    /** いまの書きかけの返答（SSE で流した分をつないだもの。なければ null） */
    streamingText: (chatId) => texts.textOf(chatId),
  };
}
