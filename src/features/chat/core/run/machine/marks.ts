// 記録から導く印（持たずに済む状態）: 最後の自分の発言・作業の終わり・圧縮・圧縮前指示・消去の記録の ID と、最後の作業の終わり方。
// 状態を作るときに記録の口から作り（marksFrom）、記録を足すたびに進める（advanceMarks）。純粋（店・時計を読まない）
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { ChatStatus } from "@shared/chat/types";

export interface TurnMarks {
  lastUserId: number;
  lastResultId: number;
  lastCompactId: number;
  /** 最後の圧縮前指示（札付きの自分の発言） */
  lastPreCompactId: number;
  lastClearedId: number;
  /** 最後の作業の終わり方（通信の切断か・使用枠の戻る時刻） */
  lastResult: { status: ChatStatus; network: boolean; usageLimitResetsAt: string | null } | null;
}

export const emptyMarks: TurnMarks = { lastUserId: 0, lastResultId: 0, lastCompactId: 0, lastPreCompactId: 0, lastClearedId: 0, lastResult: null };

/** 作業の終わりの記録から、終わり方 */
function resultOf(event: ChatEvent): TurnMarks["lastResult"] {
  if (event.type !== "result") return null;
  return { status: event.data.status, network: event.data.network === true, usageLimitResetsAt: event.data.usage_limit?.resets_at ?? null };
}

/** 記録を 1 つ足したあとの印 */
export function advanceMarks(marks: TurnMarks, event: ChatEvent): TurnMarks {
  const { id } = event;
  switch (event.type) {
    case "user":
      return { ...marks, lastUserId: Math.max(marks.lastUserId, id), ...(event.data.pre_compact ? { lastPreCompactId: Math.max(marks.lastPreCompactId, id) } : {}) };
    case "result":
      return id > marks.lastResultId ? { ...marks, lastResultId: id, lastResult: resultOf(event) } : marks;
    case "compact":
      return { ...marks, lastCompactId: Math.max(marks.lastCompactId, id) };
    case "context_cleared":
      return { ...marks, lastClearedId: Math.max(marks.lastClearedId, id) };
    default:
      return marks;
  }
}

/** 記録の口（いちばん新しい記録の ID と、最後の作業の終わり） */
export interface MarksReader {
  latestId(chatId: number, q: { type: "user" | "result" | "compact" | "context_cleared"; preCompact?: true }): number | null;
  latestResult(chatId: number): ChatEvent | null;
}

/** 記録から印を作る（状態を作るとき。全記録は読まない） */
export function marksFrom(reader: MarksReader, chatId: number): TurnMarks {
  const last = reader.latestResult(chatId);
  return {
    lastUserId: reader.latestId(chatId, { type: "user" }) ?? 0,
    lastResultId: last?.id ?? 0,
    lastCompactId: reader.latestId(chatId, { type: "compact" }) ?? 0,
    lastPreCompactId: reader.latestId(chatId, { type: "user", preCompact: true }) ?? 0,
    lastClearedId: reader.latestId(chatId, { type: "context_cleared" }) ?? 0,
    lastResult: last ? resultOf(last) : null,
  };
}

/** 前の圧縮（またはコンテキストの消去）のあとで、もう圧縮前指示を送ったか（次の圧縮まで、自動の圧縮の前にもう足さない） */
export function preCompactSent(marks: TurnMarks): boolean {
  return marks.lastPreCompactId > Math.max(marks.lastCompactId, marks.lastClearedId);
}
