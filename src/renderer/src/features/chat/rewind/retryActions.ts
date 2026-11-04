// 失敗した作業の直す操作（続きから・深さを下げて・別のモデルで・巻き戻して再試行）の判定（純粋関数）
import { EFFORT_LEVELS, type EffortLevel, type ChatEvent, type ChatEventOf } from "@shared/types";

/** 直す操作を出す失敗の作業: いちばん新しい作業の終わりが失敗で、そのあと発言していないもの（その作業の終わりの記録と、元の自分の発言） */
export interface FailedTurn {
  resultId: number;
  /** その作業を始めた自分の発言（巻き戻して再試行するとき。なければ出さない） */
  prompt?: { eventId: number; text: string };
}

/**
 * いちばん新しい作業が、直す操作を出す失敗で終わっていればその作業（なければ undefined）。
 * 通信の切断（つながったら自動で再開する）・使用枠の上限（枠が戻ったら聞く）は、それぞれの仕組みに任せるので除く
 */
export function failedTurnOf(events: ChatEvent[]): FailedTurn | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "user") return undefined;
    if (e.type !== "result") continue;
    // 通信の切断・使用枠の上限で止まったものは、それぞれの仕組み（つながったら再開・枠が戻ったら聞く）に任せる
    if (e.data.status !== "failed" || e.data.network || e.data.usage_limit) return undefined;
    const prompt = events.slice(0, i).reverse().find((x): x is ChatEventOf<"user"> => x.type === "user");
    return { resultId: e.id, ...(prompt ? { prompt: { eventId: prompt.id, text: prompt.data.text } } : {}) };
  }
  return undefined;
}

/**
 * 1 段下げた推論の深さ（そのモデルで選べるものの中で）。いまの深さが決まっていなければ既定の深さから、
 * 既定も分からなければ「中」にする。もう下げられなければ undefined
 */
export function lowerEffort(current: EffortLevel | null, fallback: EffortLevel | null | undefined, choices: readonly EffortLevel[]): EffortLevel | undefined {
  const base = current ?? fallback;
  const usable = EFFORT_LEVELS.filter((e) => choices.includes(e));
  if (!base) return usable.includes("medium") ? "medium" : usable[0];
  const index = usable.indexOf(base);
  return index > 0 ? usable[index - 1] : undefined;
}
