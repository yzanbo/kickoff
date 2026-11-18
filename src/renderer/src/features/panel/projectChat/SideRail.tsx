import { AppWindow, Globe, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { canPopout } from "@/app/popout";
import { cx } from "@/lib/cx";
import { useSetting } from "@/hooks/useSetting";
import { sideView } from "@/lib/storageKeys";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelKey } from "@/features/panel/surfaces";
import { useOrderedProjectTabGroups } from "@/features/project/page/ProjectTabs";
import { IconButton } from "@/ui/IconButton";
import { railGroupsOf, type RailGroup } from "./railGroups";
import { showSideView, type SideView } from "./sideView";
import { openSideWindow } from "./useProjectChat";

/** 列の中身のまとまり（ブラウザが先頭。ほかはプロジェクトのタブの並びとまとまり = Q4。ボード・チャットは出さない） */
function useRailGroups(): RailGroup<LucideIcon>[] {
  const groups = useOrderedProjectTabGroups();
  return useMemo(() => railGroupsOf(groups, { label: "ブラウザ", icon: Globe }), [groups]);
}

/**
 * 右サイドバーの右端のアイコンの列（VS Code のアクティビティバーと同じ形。メモの仕様書「0031_右サイドバーにプロジェクトの画面を出す」）。
 * プロジェクトの縦のタブと同じまとまりで並べ、2 つ以上のまとまり（ファイル・検索・変更・履歴）は薄い地でつなぐ（利用者の依頼）。
 * 右サイドバーを閉じていても出し、押すとその中身で開く。開いている中身のアイコンをもう一度押すと閉じる（Q3）。
 * 右サイドバーを別ウィンドウへ移している間（held）は、押すとそのウィンドウの中身を切り替えて前に出す（Q6）。いちばん下は別ウィンドウで開く・前に出すボタン。
 * inWindow: 右サイドバーの別ウィンドウの中の列（切り替えるだけで、閉じない。別ウィンドウのボタンは出さない）
 */
export function SideRail({ projectId, open, held = false, inWindow = false }: { projectId: number; open: boolean; held?: boolean; inWindow?: boolean }) {
  const groups = useRailGroups();
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
        {groups.map((group) => (
          <div key={group.key} className={cx("side-rail-group", group.items.length > 1 && "boxed")} aria-label={group.label}>
            {group.items.map(({ view: v, label, icon }) => {
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
        ))}
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
