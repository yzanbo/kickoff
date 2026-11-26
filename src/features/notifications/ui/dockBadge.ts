import { useEffect } from "react";
import type { Chat } from "@shared/chat/types";
import { isActiveProject } from "@shared/projects/kinds";
import type { Project } from "@shared/projects/types";
import { EMPTY_STATE_COUNTS, stateCounts, useChatsWithChildren, type ApprovalIndex, type StateCounts } from "@/features/chat/ui";
import { useAppliedTheme } from "@/foundation/ui/theme/useAppliedTheme";
import { showDockCounts } from "./dockIcon";
import { makeStateBadges } from "./stateBadgeModel";
import { setStateBadges } from "./native";

/**
 * Dock のアイコンに出す数: アーカイブしていないプロジェクト（共通も）のチャット（子チャットも）を、
 * 作業中・回答待ち・未読に分けた数（カンバンの列と同じ決め方 stateCounts。失敗は見るまで未読）。
 * タグの絞り込み・しまったプロジェクトの見せ方には左右されない（画面の外でも見落とさないため。純粋な関数）
 */
export function dockBadgeCounts(chats: readonly Chat[], projects: readonly Project[], pending: ApprovalIndex): StateCounts {
  const live = new Set(projects.filter(isActiveProject).map((p) => p.id));
  return stateCounts(
    chats.filter((chat) => live.has(chat.project_id)),
    pending,
  );
}

function publishStateBadges(counts: StateCounts) {
  let css: CSSStyleDeclaration | undefined;
  try {
    css = getComputedStyle(document.documentElement);
  } catch {
    // 色の取得に失敗しても、件数は送る。
  }
  setStateBadges(makeStateBadges(counts, (name) => css?.getPropertyValue(name) ?? ""));
}

/** 状態の数を Dock とローカル連携へ渡す（メインの窓だけ。Dock は切ったら・全件 0 なら元のアイコン）。 */
export function useDockBadge({ enabled, projects, pending }: { enabled: boolean | undefined; projects: readonly Project[]; pending: ApprovalIndex }) {
  const chats = useChatsWithChildren();
  // 丸の色はテーマの色なので、テーマが変わったら描き直す
  const theme = useAppliedTheme();
  const { running, needs_input, unread } = (enabled ?? true) ? dockBadgeCounts(chats, projects, pending) : EMPTY_STATE_COUNTS;
  useEffect(() => void showDockCounts({ running, needs_input, unread }), [running, needs_input, unread, theme]);
  useEffect(() => {
    // 設定の読み込み中は、外のアプリに件数を出さない（Dock の初期表示はそのまま）。
    const counts = enabled === true ? { running, needs_input, unread } : EMPTY_STATE_COUNTS;
    publishStateBadges(counts);
  }, [running, needs_input, unread, theme, enabled]);
  // 画面ごと消えるときはこの片付けが走らないので、メインプロセスでも元に戻す
  useEffect(() => () => void showDockCounts(null), []);
}
