import type { Chat } from "@shared/chat/types";

// グループ（とグループなし）へ落とした物の種類（純粋。サイドバー・ボードの列と段・タブのまとまりで共通）

/** 落とした物の種類（chat = 同じプロジェクトの親のないチャット / archived = そのアーカイブ済み / draft = 下書き / foreign = ほかのプロジェクトのチャット / child = 同じプロジェクトの子チャット） */
export const DROP_KINDS = ["chat", "archived", "draft", "foreign", "child"] as const;
export type DropKind = (typeof DROP_KINDS)[number];

/**
 * 落とした物の種類を決める。handles はその落とし先が受ける種類か（chat はいつも受ける）。受けなければ null（外側の落とし先へ任せる）。
 * archived を受けない落とし先では、アーカイブ済みもふつうのチャットとして扱う。知らないチャット（chat が undefined）は chat
 */
export function classifyDrop({ chat, draft, projectId, handles }: { chat: Chat | undefined; draft: boolean; projectId: number; handles: (kind: DropKind) => boolean }): DropKind | null {
  if (draft) return handles("draft") ? "draft" : null;
  if (chat !== undefined && chat.project_id !== projectId) return handles("foreign") ? "foreign" : null;
  if (chat !== undefined && chat.parent_chat_id !== null) return handles("child") ? "child" : null;
  if (chat?.archived_at && handles("archived")) return "archived";
  return "chat";
}
