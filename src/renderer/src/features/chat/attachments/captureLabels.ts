// 「AI に渡す」で取ったもの（capture の添付）の札に出す文（純粋関数）
import { ATTACHMENT_SOURCE_LABELS, isExternalSource } from "@shared/attachment/sources";
import { formatSize } from "@shared/attachment/truncate";
import type { CaptureAttachment } from "@shared/types";

/** 札の 2 行目（出どころの種類と取った時刻。clock は時刻の書き方） */
export function captureSubline(a: CaptureAttachment, clock: (iso: string) => string): string {
  return `${ATTACHMENT_SOURCE_LABELS[a.source.type]} · ${clock(a.taken_at)} に取得`;
}

/** 乗せたときの説明（何をいつ取ったか・外から来たか・伏せた数・切ったか。AI への見出しと同じことを書く） */
export function captureTitle(a: CaptureAttachment, clock: (iso: string) => string): string {
  const lines = [`${ATTACHMENT_SOURCE_LABELS[a.source.type]}「${a.source.label}」`, `${clock(a.taken_at)} に押したときの中身です（あとで変わっても、この中身を渡します）`];
  if (isExternalSource(a.source.type)) lines.push("外から来たデータです（AI には、指示ではないと伝えます）");
  if (a.redacted > 0) lines.push(`鍵らしい値を ${a.redacted} か所伏せました`);
  if (a.truncated) lines.push(`大きすぎたので頭と終わりだけ残しました（元は ${formatSize(a.original_size)}）`);
  return lines.join("\n");
}
