// 会話の区切り（作業場所を移した・AI を切り替えた）。区切りより前の記録へは、分岐・巻き戻し・ファイルを戻すができない
// （コアの断る文と画面のボタンの理由で同じ文を使う）
import type { ChatEvent } from "./chatEvent";

/** 区切りの記録の種類（前にある方を先に見る） */
export const BOUNDARY_EVENTS = ["workplace_moved", "provider_switched"] as const;
export type BoundaryEvent = (typeof BOUNDARY_EVENTS)[number];

/** 区切りより前にできない操作 */
export type LockedAction = "fork" | "rewind" | "files";

/** 区切りより前の記録でできないときの文 */
export const LOCKED_LABELS: Record<BoundaryEvent, Record<LockedAction, string>> = {
  workplace_moved: {
    rewind: "作業場所を移す前の発言なので巻き戻せません（会話もファイルも）",
    fork: "作業場所を移す前の地点なので分岐できません",
    files: "作業場所を移す前の発言なので、ファイルは戻せません",
  },
  provider_switched: {
    rewind: "AI を切り替える前の発言なので巻き戻せません",
    fork: "AI を切り替える前の地点なので分岐できません",
    files: "AI を切り替える前の発言なので、ファイルは戻せません",
  },
};

/** その記録より後にある区切りの種類（作業場所の移動を先に見る。なければ null） */
export function boundaryAfter(events: readonly ChatEvent[], eventId: number): BoundaryEvent | null {
  return BOUNDARY_EVENTS.find((type) => events.some((e) => e.type === type && e.id > eventId)) ?? null;
}

/** その記録より後に区切りがあれば、action を断る文（なければ null） */
export function lockedBefore(events: readonly ChatEvent[], eventId: number, action: LockedAction): string | null {
  const boundary = boundaryAfter(events, eventId);
  return boundary ? LOCKED_LABELS[boundary][action] : null;
}
