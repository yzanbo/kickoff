import { useEffect } from "react";
import type { Chat } from "@shared/chat/types";
import { isListedProject } from "@shared/projects/kinds";
import type { Project } from "@shared/projects/types";
import { stateCounts, useChatsWithChildren, type ApprovalIndex, type StateCounts } from "@/features/chat/ui";
import { useAppliedTheme } from "@/foundation/ui/theme/useAppliedTheme";
import { resetDockIcon, showDockCounts } from "./dockIcon";

const NO_COUNTS: StateCounts = { running: 0, needs_input: 0, unread: 0 };

/**
 * Dock のアイコンに出す数: アーカイブしていない、一覧に並べるプロジェクト（isListedProject）のチャット（子チャットも）を、
 * 作業中・回答待ち・未読に分けた数（カンバンの列と同じ決め方 stateCounts。失敗は見るまで未読）。
 * タグの絞り込み・しまったプロジェクトの見せ方には左右されない（画面の外でも見落とさないため。純粋な関数）
 */
export function dockBadgeCounts(chats: readonly Chat[], projects: readonly Project[], pending: ApprovalIndex): StateCounts {
  const live = new Set(projects.filter((p) => !p.archived_at && isListedProject(p)).map((p) => p.id));
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
  const { running, needs_input, unread } = enabled ? dockBadgeCounts(chats, projects, pending) : NO_COUNTS;
  useEffect(() => void showDockCounts({ running, needs_input, unread }), [running, needs_input, unread, theme]);
  // 部品を外すときは戻す（画面を閉じる・読み込み直すときはメインが戻す。dockIcon.ts の watch）
  useEffect(() => resetDockIcon, []);
}
