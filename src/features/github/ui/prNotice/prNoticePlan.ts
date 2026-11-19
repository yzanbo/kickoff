// ワークツリーの PR の知らせの確認で選ぶもの（ワークツリー・チャットの扱い）と、確認に出す注意（純粋な関数）
import type { Chat, WorktreePrNotice, WorktreeRemovalInfo } from "@shared/types";

/** ワークツリーの扱い（both = ワークツリーとブランチを消す / worktree = ワークツリーだけ消す / keep = 残す。名前は削除の確認と同じ） */
export const PR_WORKTREE_ACTIONS = ["both", "worktree", "keep"] as const;
export type PrWorktreeAction = (typeof PR_WORKTREE_ACTIONS)[number];
export const PR_WORKTREE_ACTION_LABELS: Record<PrWorktreeAction, string> = { both: "ブランチも消す", worktree: "ワークツリーだけ消す", keep: "残す" };

/** そのワークツリーのチャット（子チャットも）の扱い */
export const PR_CHAT_ACTIONS = ["archive", "delete", "keep"] as const;
export type PrChatAction = (typeof PR_CHAT_ACTIONS)[number];
export const PR_CHAT_ACTION_LABELS: Record<PrChatAction, string> = { archive: "アーカイブ", delete: "削除", keep: "そのまま" };

/** 知らせの見出し（「PR #12 がマージされました」） */
export const prNoticeTitle = (notice: WorktreePrNotice) => `PR #${notice.pr.number} が${notice.pr.state === "MERGED" ? "マージされました" : "マージされずに閉じられました"}`;

/** 印の短い名前 */
export const prNoticeMarkLabel = (notice: WorktreePrNotice) => (notice.pr.state === "MERGED" ? "マージ済み" : "閉じた");

/** ワークツリーの扱いの初めの値（マージされたら片付け、閉じられたら作業を失わないようブランチは残す。ブランチのないワークツリーはフォルダだけ） */
export const defaultWorktreeAction = (notice: WorktreePrNotice): PrWorktreeAction => (notice.pr.state === "MERGED" ? "both" : "worktree");

/** アーカイブ・削除をするチャット（親も入っている子チャットは、親と一緒に扱われるので除く） */
export function rootChatIds(chats: Pick<Chat, "id" | "parent_chat_id">[]): number[] {
  const ids = new Set(chats.map((c) => c.id));
  return chats.filter((c) => c.parent_chat_id === null || !ids.has(c.parent_chat_id)).map((c) => c.id);
}

/**
 * 確認に出す注意（作業中のチャット・コミットしていない変更・プッシュしていないコミット・このブランチにしかないコミット）。
 * 消さないなら、ワークツリーの中身の注意は出さない
 */
export function prNoticeWarnings(info: WorktreeRemovalInfo | undefined, running: number, action: PrWorktreeAction, chatAction: PrChatAction): string[] {
  const removing = action !== "keep";
  return [
    running > 0 && (removing || chatAction !== "keep") && `作業中のチャットが ${running} 件あります。終わってから片付けてください。`,
    removing && info && info.changes > 0 && `コミットしていない変更が ${info.changes} ファイルあります。ワークツリーを消すとなくなります。`,
    removing && info?.has_remote && info.unpushed > 0 && `GitHub にプッシュしていないコミットが ${info.unpushed} 件あります。`,
    action === "both" && info && info.only_here > 0 && `このブランチにしかないコミットが ${info.only_here} 件あります。ブランチも消すと元に戻せません。`,
    chatAction === "delete" && "チャットを削除すると、元に戻せません。",
  ].filter((w): w is string => Boolean(w));
}
