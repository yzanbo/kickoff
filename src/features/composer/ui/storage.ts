// composer の画面の保存（キーは kickoff:composer:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import type { Attachment } from "@shared/chat/types";
import { choice, defineSettings, family, json, text } from "@/foundation/ui/storage";

const NO_ATTACHMENTS: readonly Attachment[] = [];

/** 残しておいた添付の 1 つが使える形か（ノートはパスと写した時刻、取ったものは出どころと時刻が要る） */
function isStoredAttachment(value: unknown): value is Attachment {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Record<string, unknown>;
  if (typeof a.id !== "string" || typeof a.name !== "string" || typeof a.mime !== "string" || typeof a.size !== "number") return false;
  if (a.kind === "file") return true;
  if (a.kind === "note") return typeof a.note === "string" && typeof a.taken_at === "string";
  return a.kind === "capture" && typeof a.source === "object" && a.source !== null && typeof a.taken_at === "string";
}

/** 残しておいた添付の列（形の合わない要素は捨てる） */
function parseAttachments(value: unknown): readonly Attachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isStoredAttachment);
}

/** 前の保存の名前（tell / queue）も同じ扱いとして読む */
const LEGACY_WHEN: Readonly<Record<string, "now" | "later">> = { tell: "now", queue: "later" };
function sendWhen() {
  const shape = choice(["later", "now"], "now");
  return { ...shape, decode: (raw: string) => shape.decode(raw) ?? LEGACY_WHEN[raw] };
}

export const storage = defineSettings("composer", {
  /** 作業中・送信待ちがあるときに送った指示の扱い（コアの when と同じ名前。later = あとで（送信待ちに足す）/ now = いま（止めずに伝える）） */
  queueMode: sendWhen(),
  /** チャットごとの、入力欄の書きかけの文（空にした・送った・チャットを削除したら消す） */
  draft: family(text(), { ids: true }),
  /** チャットごとの、入力欄に添付して送る前のもの（アップロード済みの添付。外した・送った・チャットを削除したら消す。形の合わないものは捨てる） */
  attachments: family(json(parseAttachments, NO_ATTACHMENTS, (v) => v.length === 0), { ids: true }),
});
