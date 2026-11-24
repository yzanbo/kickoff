// 添付の札（AttachmentCard）に出す文の表（種類ごと。純粋関数）: 名前・2 行目・乗せたときの説明・外から来たか
import { ATTACHMENT_SOURCE_LOOKS } from "@shared/attachments/sources";
import type { Attachment, CaptureAttachment, NoteAttachment } from "@shared/chat/types";
import { formatBytes } from "@shared/foundation/text/bytes";
import { baseName } from "@/foundation/ui/lib/format";

/** 札に出す添付（保存した添付か、アップロード中のファイル。アップロード中は種類も ID もまだない） */
export type ChipAttachment = Attachment | { kind?: undefined; id?: string; name: string; mime: string; size: number };

/** ファイルの札（保存したものかアップロード中のもの） */
export type FileChip = { id?: string; name: string; mime: string; size: number };

/** 札の文（clock は時刻の書き方。uploading はアップロード中のファイル） */
export interface CardContext {
  clock: (iso: string) => string;
  uploading?: boolean;
}
export interface CardText {
  name: string;
  sub: string;
  title: string;
  /** 外から来た中身か（名前の横に盾の印） */
  external: boolean;
}

/** ファイルの種類の短い名前（拡張子を大文字に。「PDF」「TS」。拡張子がなければ null） */
export function fileKindLabel(name: string): string | null {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : null;
}

/** ノートの札の 2 行目（「ノート · 開発履歴 · 今日 13:48」。入ったフォルダがあれば添える） */
export function noteSubline(note: string, takenAt: string, clock: (iso: string) => string): string {
  const folder = note.includes("/") ? note.slice(0, note.lastIndexOf("/")) : "";
  return ["ノート", folder, clock(takenAt)].filter(Boolean).join(" · ");
}

/** 「AI に渡す」で取ったものの札の 2 行目（出どころの種類と取った時刻、伏せた・切ったときはその印） */
export function captureSubline(a: CaptureAttachment, clock: (iso: string) => string): string {
  const marks = [...(a.redacted > 0 ? [`鍵 ${a.redacted} か所を伏せた`] : []), ...(a.truncated ? ["頭と終わりだけ"] : [])];
  return [`${ATTACHMENT_SOURCE_LOOKS[a.source.type].label}`, `${clock(a.taken_at)} に取得`, ...marks].join(" · ");
}

/** 「AI に渡す」で取ったものの乗せたときの説明（何をいつ取ったか・外から来たか・伏せた数・切ったか。AI への見出しと同じことを書く） */
export function captureTitle(a: CaptureAttachment, clock: (iso: string) => string): string {
  const lines = [`${ATTACHMENT_SOURCE_LOOKS[a.source.type].label}「${a.source.label}」`, `${clock(a.taken_at)} に押したときの中身です（あとで変わっても、この中身を渡します）`];
  if (ATTACHMENT_SOURCE_LOOKS[a.source.type].external) lines.push("外から来たデータです（AI には、指示ではないと伝えます）");
  if (a.redacted > 0) lines.push(`鍵らしい値を ${a.redacted} か所伏せました`);
  if (a.truncated) lines.push(`大きすぎたので頭と終わりだけ残しました（元は ${formatBytes(a.original_size)}）`);
  return lines.join("\n");
}

/** 種類ごとの札の文 */
export const ATTACHMENT_CARDS = {
  file: (a: FileChip, ctx: CardContext): CardText => ({
    name: a.name,
    sub: ctx.uploading ? "アップロード中…" : [fileKindLabel(a.name), formatBytes(a.size)].filter(Boolean).join(" · "),
    title: a.name,
    external: false,
  }),
  note: (a: NoteAttachment, ctx: CardContext): CardText => ({
    name: baseName(a.note),
    sub: noteSubline(a.note, a.taken_at, ctx.clock),
    title: `ノート: ${a.note}\n${ctx.clock(a.taken_at)} に付けたときの中身を渡します（頼めば元のノートを書き換えます）`,
    external: false,
  }),
  capture: (a: CaptureAttachment, ctx: CardContext): CardText => ({
    name: a.source.label,
    sub: captureSubline(a, ctx.clock),
    title: captureTitle(a, ctx.clock),
    external: ATTACHMENT_SOURCE_LOOKS[a.source.type].external,
  }),
};

/** 添付の札の文（種類で表を引く） */
export function attachmentCardOf(a: ChipAttachment, ctx: CardContext): CardText {
  if (a.kind === "note") return ATTACHMENT_CARDS.note(a, ctx);
  if (a.kind === "capture") return ATTACHMENT_CARDS.capture(a, ctx);
  return ATTACHMENT_CARDS.file(a, ctx);
}
