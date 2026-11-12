import type { Attachment } from "@shared/types";

/** 種類（kind）を持つ前に保存した添付の形（チャットの記録・送信待ちに残っている。memo があればメモの添付） */
interface LegacyAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  memo?: string;
  kind?: undefined;
}

/**
 * 添付を今の形にする（古い形は、memo があればメモの添付・なければファイルとして読み替える。表は作り直さない）。
 * 記録・送信待ちを読むとき（コア）と、API の本文・入力欄の下書きを読むとき（コア・画面）に通す
 */
export function normalizeAttachment(attachment: Attachment | LegacyAttachment): Attachment {
  if (attachment.kind !== undefined) return attachment;
  const { memo, ...base } = attachment;
  return memo !== undefined ? { ...base, kind: "memo", memo } : { ...base, kind: "file" };
}
