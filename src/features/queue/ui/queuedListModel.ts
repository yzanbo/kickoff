// 送信待ちの一覧の並び（行・印の線・書き直す欄）と、出し方・畳んだ 1 行の「次:」・送った指示が出る所の印（純粋）
import type { QueuedMessage } from "@shared/chat/types";
import { nextQueuedText } from "./queuedHint";

/** 一覧の 1 つ: 印の線（同じ位置に何本もあれば nth 本目・here 本）か、指示の行（editing なら書き直す欄） */
export type QueuedListItem = { kind: "stop"; at: number; nth: number; here: number } | { kind: "row"; message: QueuedMessage; index: number; editing: boolean };

/** 一覧の並び: 各行の前にその位置の印の線、最後にすべて送ったあとの線 */
export function queuedListItems(messages: readonly QueuedMessage[], stops: readonly number[], editing: (id: string) => boolean): QueuedListItem[] {
  const linesAt = (at: number): QueuedListItem[] => {
    const here = stops.filter((x) => x === at).length;
    return Array.from({ length: here }, (_, nth) => ({ kind: "stop", at, nth, here }));
  };
  return [...messages.flatMap((message, index) => [...linesAt(index), { kind: "row" as const, message, index, editing: editing(message.id) }]), ...linesAt(messages.length)];
}

/** 出し方: 一覧 / 空で、いまの作業が終わったら止める印だけがある（質問として送った）ときの 1 行 / 出さない */
export function queuedShape(count: number, sending: number, busy: boolean, stops: readonly number[]): "list" | "pause" | null {
  if (count > 0 || sending > 0) return "list";
  return busy && stops.includes(0) ? "pause" : null;
}

/** 畳んだ 1 行に出す「次:」の文（開いているときは出さない） */
export function collapsedNext(collapsed: boolean, messages: readonly QueuedMessage[]): string {
  return collapsed && messages.length > 0 ? nextQueuedText(messages[0]) : "";
}
