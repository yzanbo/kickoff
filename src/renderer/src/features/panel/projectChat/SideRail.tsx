import { AppWindow, Globe, type LucideIcon } from "lucide-react";
import { canPopout } from "@/app/popout";
import { cx } from "@/lib/cx";
import { useSetting } from "@/hooks/useSetting";
import { sideView } from "@/lib/storageKeys";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelKey } from "@/features/panel/surfaces";
import { useOrderedProjectTabs } from "@/features/project/page/ProjectTabs";
import { IconButton } from "@/ui/IconButton";
import { sideViewOfTab, showSideView, type SideView } from "./sideView";
import { openSideWindow } from "./useProjectChat";

/** 列に並べる中身 1 つ */
interface RailItem {
  view: SideView;
  label: string;
  icon: LucideIcon;
}

/** 列の中身（ブラウザが先頭。ほかはプロジェクトのタブの並び = Q4。ボード・チャットは出さない） */
function useRailItems(): RailItem[] {
  const tabs = useOrderedProjectTabs();
  const items: RailItem[] = [{ view: "browser", label: "ブラウザ", icon: Globe }];
  for (const t of tabs) {
    const view = sideViewOfTab(t.tab);
    if (view) items.push({ view, label: t.tip ?? t.label, icon: t.icon });
  }
  return items;
}

/**
 * 右サイドバーの右端のアイコンの列（VS Code のアクティビティバーと同じ形。メモの仕様書「0031_右サイドバーにプロジェクトの画面を出す」）。
 * 右サイドバーを閉じていても出し、押すとその中身で開く。開いている中身のアイコンをもう一度押すと閉じる（Q3）。
 * 右サイドバーを別ウィンドウへ移している間（held）は、押すとそのウィンドウの中身を切り替えて前に出す（Q6）。いちばん下は別ウィンドウで開く・前に出すボタン。
 * inWindow: 右サイドバーの別ウィンドウの中の列（切り替えるだけで、閉じない。別ウィンドウのボタンは出さない）
 */
export function SideRail({ projectId, open, held = false, inWindow = false }: { projectId: number; open: boolean; held?: boolean; inWindow?: boolean }) {
  const items = useRailItems();
  const [view] = useSetting(sideView(projectId));
  const shown = open || held || inWindow;
  const pick = (next: SideView) => {
    if (inWindow) return showSideView(projectId, next);
    if (!held && open && view === next) return panelActions(panelKey("side", projectId)).setOpen(false);
    showSideView(projectId, next);
  };
  return (
    <nav className={cx("side-rail", inWindow && "in-window")} aria-label="右サイドバーの中身">
      <div className="side-rail-items" role="tablist" aria-orientation="vertical">
        {items.map(({ view: v, label, icon }) => {
          const active = shown && view === v;
          return (
            <IconButton
              key={v}
              icon={icon}
              size={18}
              role="tab"
              aria-selected={active}
              className={cx("side-rail-item", active && "active")}
              label={label}
              title={active && !held && !inWindow ? `${label}（押すと右サイドバーを閉じる）` : label}
              data-tip-side="left"
              onClick={() => pick(v)}
            />
          );
        })}
      </div>
      {!inWindow && canPopout() && (
        <IconButton
          icon={AppWindow}
          size={16}
          className={cx("side-rail-item side-rail-popout", held && "active")}
          label={held ? "別ウィンドウの右サイドバーを前に出す" : "右サイドバーを別ウィンドウで開く"}
          title={held ? "別ウィンドウの右サイドバーを前に出す（右サイドバーは別ウィンドウに移しています）" : "右サイドバーを別ウィンドウで開く（アイコンの列と中身をまとめて移す）"}
          aria-pressed={held}
          data-tip-side="left"
          onClick={openSideWindow}
        />
      )}
    </nav>
  );
}
