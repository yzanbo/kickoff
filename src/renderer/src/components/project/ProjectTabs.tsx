import { Code2, History, SquareKanban, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { Run } from "../../../../core/types";
import { useRunStates } from "../../approvalsContext";
import { cx } from "../../cx";
import { stateCounts } from "../../runState";
import { useSharedChoice } from "../../hooks/useStoredState";
import { href, type ProjectTab } from "../../router";
import { PROJECT_TABS_LAYOUT_KEY } from "../../storageKeys";
import { useBoardColumns } from "../board/BoardColumnsToggle";
import { ChoiceMenu } from "../menus/ChoiceMenu";
import { clampToViewport } from "../PopupMenu";

/** タブの置き方（top = 見出しの下に横並び / side = 左に縦並び・アイコンだけ。縦の幅を本体に回せる） */
export type ProjectTabsLayout = "top" | "side";
const LAYOUTS: readonly ProjectTabsLayout[] = ["top", "side"];
/** 置き方の名前（設定の「表示」と、タブの右クリックのメニューで共通） */
export const PROJECT_TABS_LAYOUT_LABELS: Record<ProjectTabsLayout, string> = { top: "上に横並び", side: "左に縦並び（アイコン）" };

/** タブの置き方（設定の「表示」で選ぶ。どのプロジェクトでも同じ。初めは左に縦並び（選んだことがなければ、入れたばかりでも縦並び）） */
export function useProjectTabsLayout() {
  return useSharedChoice<ProjectTabsLayout>(PROJECT_TABS_LAYOUT_KEY, LAYOUTS, "side");
}

/** タブの列に出すタブ（グループは「ボード」の中の列の切り替えにまとめたので出さない） */
const TABS: { tab: ProjectTab; label: string; icon: LucideIcon }[] = [
  { tab: "board", label: "ボード", icon: SquareKanban },
  { tab: "changes", label: "エディタ", icon: Code2 },
  { tab: "history", label: "履歴", icon: History },
];

/**
 * プロジェクトの画面のタブ（ボード・エディタ）。ボードには未読のチャットの数（作業中のまま未読のものは数えない。サイドバーの「未読」の数と同じ stateCounts）、
 * エディタには変更のあるファイルの数を添える。
 * vertical: 左に縦並び（アイコンだけ。名前と数は title と aria-label）。右クリックで置き方（横並び / 縦並び）を切り替える
 */
export function ProjectTabs({ projectId, tab, runs, changeCount, vertical = false }: { projectId: number; tab: ProjectTab; runs: Run[]; changeCount: number; vertical?: boolean }) {
  const [columns] = useBoardColumns();
  const [layout, setLayout] = useProjectTabsLayout();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // 未読のチャット（カンバンの「未読」の列と同じ。作業中のまま未読のもの・アーカイブ済みは数えない）
  const { pending } = useRunStates();
  const unread = stateCounts(runs, pending).review;
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
        // 数はボード（未読のチャット）とエディタ（変更のあるファイル）だけ。履歴には出さない
        const count = t === "board" ? unread : t === "changes" ? changeCount : 0;
        const countLabel = t === "board" ? `未読のチャット ${count} 件` : `変更のあるファイル ${count} 件`;
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
            {t === "board" && count > 0 && <span className="tab-count">{count}</span>}
            {t === "changes" && count > 0 && (
              <span className="change-count" aria-label={vertical ? undefined : countLabel}>
                {count}
              </span>
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
