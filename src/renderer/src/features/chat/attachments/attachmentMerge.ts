// 入力欄の添付の並びに足すときの決まり（純粋関数。入力欄の中と、開いていないチャットの下書きで同じにする）
import type { Attachment } from "@shared/types";

/** 同じものか（同じ ID・同じメモ・同じ出どころの取ったもの）。付けなおしたら前のものと入れ替える */
export function sameAttachment(a: Attachment, b: Attachment): boolean {
  if (a.id === b.id) return true;
  if (a.kind === "memo" && b.kind === "memo") return a.memo === b.memo;
  if (a.kind === "capture" && b.kind === "capture") return a.source.type === b.source.type && a.source.label === b.source.label;
  return false;
}

/** 添付の並びに足す（同じものは前のものを外して後ろに足す。付けなおした時点の中身にする） */
export function mergeAttachments(prev: readonly Attachment[], added: readonly Attachment[]): Attachment[] {
  return [...prev.filter((a) => !added.some((b) => sameAttachment(a, b))), ...added];
}
