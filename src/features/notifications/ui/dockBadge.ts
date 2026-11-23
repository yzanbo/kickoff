import { useEffect } from "react";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { useChatsWithChildren, waitingChats, type ApprovalIndex } from "@/features/chat/ui";
import { setDockBadge } from "./native";

/**
 * Dock のアイコンに出す数: アーカイブしていないプロジェクトの要対応（回答待ち・未読。子チャットも。サイドバーの「要対応」と同じ決め方）のチャットの数。
 * タグの絞り込み・しまったプロジェクトの見せ方には左右されない（画面の外でも見落とさないため。純粋な関数）
 */
export function dockBadgeCount(chats: readonly Chat[], projects: readonly Project[], pending: ApprovalIndex): number {
  const live = new Set(projects.filter((p) => !p.archived_at).map((p) => p.id));
  return waitingChats(
    chats.filter((chat) => live.has(chat.project_id)),
    pending,
  ).length;
}

/** 要対応の数を Dock のアイコンの赤い数字にする（メインの窓だけで使う。切ったら・数が 0 なら消す。デスクトップアプリだけ） */
export function useDockBadge({ enabled, projects, pending }: { enabled: boolean; projects: readonly Project[]; pending: ApprovalIndex }) {
  const chats = useChatsWithChildren();
  const count = enabled ? dockBadgeCount(chats, projects, pending) : 0;
  useEffect(() => setDockBadge(count), [count]);
  // 画面を閉じる・読み込み直すときは消す（読み込み直したら数え直して出し直す）
  useEffect(() => () => setDockBadge(0), []);
}
