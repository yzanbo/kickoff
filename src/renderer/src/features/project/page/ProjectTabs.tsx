import { Code2, History, SquareKanban, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { cx } from "@/lib/cx";
import { stateCounts } from "@/features/chat/chatState";
import { StateCornerCounts, stateCountsSummary } from "@/features/chatList/StateCornerCounts";
import { useSharedChoice } from "@/hooks/useStoredState";
import { href, type ProjectTab } from "@/app/router";
import { PROJECT_TABS_LAYOUT_KEY } from "@/lib/storageKeys";
import { useBoardColumns } from "@/features/board/BoardColumnsToggle";
import { ChoiceMenu } from "@/ui/ChoiceMenu";
import { clampToViewport } from "@/ui/PopupMenu";

/** タブの置き方（top = 見出しの下に横並び / side = 左に縦並び・アイコンだけ。縦の幅を本体に回せる） */
export type ProjectTabsLayout = "top" | "side";
const LAYOUTS: readonly ProjectTabsLayout[] = ["top", "side"];
/** 置き方の名前（設定の「表示」と、タブの右クリックのメニューで共通） */
export const PROJECT_TABS_LAYOUT_LABELS: Record<ProjectTabsLayout, string> = { top: "上に横並び", side: "左に縦並び（アイコン）" };

/** タブの置き方（設定の「表示」で選ぶ。どのプロジェクトでも同じ。初めは左に縦並び（選んだことがなければ、入れたばかりでも縦並び）） */
export function useProjectTabsLayout() {
  return useSharedChoice<ProjectTabsLayout>(PROJECT_TABS_LAYOUT_KEY, LAYOUTS, "side");
}

/** タブの数を取り直している最中か（ボード = チャットの一覧・エディタ = Git の状態。数の代わりに更新中の印を出す） */
export interface TabRefreshing {
  chats: boolean;
  changes: boolean;
}

/** タブの列に出すタブ（グループは「ボード」の中の列の切り替えにまとめたので出さない） */
const TABS: { tab: ProjectTab; label: string; icon: LucideIcon }[] = [
  { tab: "board", label: "ボード", icon: SquareKanban },
  { tab: "changes", label: "エディタ", icon: Code2 },
  { tab: "history", label: "履歴", icon: History },
];

/**
 * プロジェクトの画面のタブ（ボード・エディタ）。ボードには状態ごとのチャット数（サイドバーのプロジェクトの丸と同じ StateCornerCounts。
 * 縦並びはアイコンの角に重ね（左上 = 作業中・右上 = 未読・左下 = 回答待ち）、横並びは名前の後ろに並べる。作業中のまま未読のものは未読に数えない）、
 * エディタには変更のあるファイルの数を添える。取り直している最中（refreshing）は、VS Code のバッジと同じく数の代わりに回る印を出す。
 * vertical: 左に縦並び（アイコンだけ。名前と数は title と aria-label）。右クリックで置き方（横並び / 縦並び）を切り替える
 */
export function ProjectTabs({
  projectId,
  tab,
  chats,
  changeCount,
  refreshing,
  vertical = false,
}: {
  projectId: number;
  tab: ProjectTab;
  chats: Chat[];
  changeCount: number;
  refreshing: TabRefreshing;
  vertical?: boolean;
}) {
  const [columns] = useBoardColumns();
  const [layout, setLayout] = useProjectTabsLayout();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // 状態ごとのチャット数（カンバンの列と同じ数え方。アーカイブ済みは数えない）
  const { pending } = useChatStates();
  const counts = stateCounts(chats, pending);
  const countsText = stateCountsSummary(counts);
  return (
    <nav
      className={cx("tabs", vertical && "project-side-tabs")}
      role="tablist"
      aria-orientation={vertical ? "vertical" : undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(clampToViewport(e.clientX, e.clientY, 220, 100));
      }}
    >
      {TABS.map(({ tab: t, label, icon: Icon }) => {
        // ボードのタブは、列が状態でもグループでも選んだ状態にし、押したら最後に見た列の分け方で開く
        const selected = tab === t || (t === "board" && tab === "groups");
        const target: ProjectTab = t === "board" && columns === "groups" ? "groups" : t;
        // 数はボード（状態ごとのチャット）とエディタ（変更のあるファイル）だけ。履歴には出さない
        const count = t === "board" ? (countsText ? 1 : 0) : t === "changes" ? changeCount : 0;
        const countLabel = t === "board" ? countsText : `変更のあるファイル ${count} 件`;
        return (
          <a
            key={t}
            role="tab"
            aria-selected={selected}
            aria-label={vertical ? `${label}${count > 0 ? `（${countLabel}）` : ""}` : undefined}
            title={vertical ? `${label}${count > 0 ? `（${countLabel}）` : ""}` : t === "board" && count > 0 ? countLabel : undefined}
            className={`tab ${selected ? "active" : ""}`}
            href={href({ name: "project", id: projectId, tab: target })}
          >
            {vertical ? <Icon size={18} aria-hidden /> : label}
            {/* 取り直している最中は数の代わりに更新中の印（終わったら数に戻す） */}
            {(t === "board" && refreshing.chats) || (t === "changes" && refreshing.changes) ? (
              <span className="tab-refreshing" role="status" aria-label="更新中" title="更新中…">
                <span className="spinner" aria-hidden />
              </span>
            ) : t === "board" ? (
              <StateCornerCounts counts={counts} inline={!vertical} />
            ) : (
              t === "changes" &&
              count > 0 && (
                <span className="change-count" aria-label={vertical ? undefined : countLabel}>
                  {count}
                </span>
              )
            )}
          </a>
        );
      })}
      {menu && (
        <ChoiceMenu
          x={menu.x}
          y={menu.y}
          title="タブの置き方"
          values={LAYOUTS}
          labels={PROJECT_TABS_LAYOUT_LABELS}
          value={layout}
          onPick={setLayout}
          onClose={() => setMenu(null)}
        />
      )}
    </nav>
  );
}
