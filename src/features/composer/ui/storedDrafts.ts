// composer が残すものの形と解析（storage.ts が読む。パッケージ・React・ほかの機能を読まない）
import type { Attachment, GitHubLink } from "@shared/chat/types";

export const NO_ATTACHMENTS: readonly Attachment[] = [];

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
export function parseAttachments(value: unknown): readonly Attachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isStoredAttachment);
}

/** 送る前の新しいチャット（下書き）。タブ（kind: "new"）は同じキーでこれを指すだけ（newChatDrafts.ts） */
export interface NewChatDraft {
  /** 下書きのキー（タブのキーと同じ） */
  key: string;
  projectId: number;
  /** 作成先のグループ（グループの＋から始めた・サイドバーでグループへ落とした） */
  group?: number;
  /** 作成先のグループ名（タブに出す。パネルの中で分かりしだい入れる） */
  groupName?: string;
  /** 始める作業場所のワークツリーのフォルダ（なければ本体） */
  worktree?: string;
  /** 書いている途中の文 */
  text: string;
  /** 送る前の添付（アップロード済み。外すまで残す） */
  attachments?: Attachment[];
  /** 送る前に付けた名前（送ったらその名前のチャットになる） */
  title?: string;
  /** サイドバーの「固定」に出すか（送ったら、できたチャットも固定する） */
  pinned?: boolean;
  /** 初めに入力欄に入れたもの（送信待ちの指示・GitHub から始めたとき。案内と結び付ける issue・新しいワークツリーに使う。chat の NewChatSeed と同じ形） */
  seed?: { text: string; attachments: Attachment[]; github?: GitHubLink; newWorktreeBranch?: string };
}

export const NO_DRAFTS: readonly NewChatDraft[] = [];

/** 残しておいた下書きの列（キー・プロジェクトのないものは捨て、添付は使える形だけ） */
export function parseNewChatDrafts(value: unknown): readonly NewChatDraft[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((v: unknown): NewChatDraft[] => {
    const d = v as Partial<NewChatDraft> | null;
    if (!d || typeof d.key !== "string" || typeof d.projectId !== "number") return [];
    const attachments = parseAttachments(d.attachments);
    return [{ ...d, key: d.key, projectId: d.projectId, text: typeof d.text === "string" ? d.text : "", attachments: attachments ? [...attachments] : undefined }];
  });
}
