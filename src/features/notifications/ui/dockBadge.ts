import { useEffect } from "react";
import type { Chat } from "@shared/chat/types";
import { isActiveListedProject } from "@shared/projects/kinds";
import type { Project } from "@shared/projects/types";
import { EMPTY_STATE_COUNTS, stateCounts, useChatsWithChildren, type ApprovalIndex, type StateCounts } from "@/features/chat/ui";
import { useAppliedTheme } from "@/foundation/ui/theme/useAppliedTheme";
import { showDockCounts } from "./dockIcon";

/**
 * Dock のアイコンに出す数: アーカイブしていない、一覧に並べるプロジェクトのチャット（子チャットも）を、
 * 作業中・回答待ち・未読に分けた数（カンバンの列と同じ決め方 stateCounts。失敗は見るまで未読）。
 * タグの絞り込み・しまったプロジェクトの見せ方には左右されない（画面の外でも見落とさないため。純粋な関数）
 */
export function dockBadgeCounts(chats: readonly Chat[], projects: readonly Project[], pending: ApprovalIndex): StateCounts {
  const live = new Set(projects.filter(isActiveListedProject).map((p) => p.id));
  return stateCounts(
    chats.filter((chat) => live.has(chat.project_id)),
    pending,
  );
}

/** 状態の数を Dock のアイコンの隅に出す（メインの窓だけで使う。切ったら・3 つとも 0 なら元のアイコン。デスクトップアプリだけ） */
export function useDockBadge({ enabled, projects, pending }: { enabled: boolean; projects: readonly Project[]; pending: ApprovalIndex }) {
  const chats = useChatsWithChildren();
  // 丸の色はテーマの色なので、テーマが変わったら描き直す
  const theme = useAppliedTheme();
  const { running, needs_input, unread } = enabled ? dockBadgeCounts(chats, projects, pending) : EMPTY_STATE_COUNTS;
  useEffect(() => void showDockCounts({ running, needs_input, unread }), [running, needs_input, unread, theme]);
  // 画面ごと消えるときはこの片付けが走らないので、メインプロセスでも元に戻す
  useEffect(() => () => void showDockCounts(null), []);
}
