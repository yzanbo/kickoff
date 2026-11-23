import "./SideRail.css";
import { AppWindow, GripHorizontal, type LucideIcon } from "lucide-react";
import { useMemo, type ComponentProps } from "react";
import { canPopout } from "@/foundation/ui/navigation/popout";
import { cx } from "@/foundation/ui/lib/cx";
import { panelKey, setPanelOpen } from "@/features/panel/ui";
import { availableProjectViews, projectViewGroups } from "@/features/projects/ui/projectViews";
import { useProjectTabOrder } from "@/features/projects/ui/page/useProjectTabOrder";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { railGroupsOf } from "./railGroups";
import { showSideView, useSideView, type SideView } from "./sideView";
import { openSideWindow } from "./useRightSidebar";

/**
 * プロジェクトのタブのまとまり（真ん中に置ける画面の表。並べ替えの全体）と、列のまとまり（そこから右サイドバーに置けないボード・チャットを除いたもの）、
 * 右サイドバーだけの画面（ブラウザ。並べ替えずにいつも先頭）
 */
function useRailGroups() {
  return useMemo(() => {
    const side = availableProjectViews("rightSidebar");
    const all = projectViewGroups(availableProjectViews("center")).map((g) => ({ ...g, tabs: g.tabs.map(({ tab, def }) => ({ tab, label: def.label, tip: def.tip, icon: def.icon })) }));
    return { all, rail: railGroupsOf<LucideIcon>(all, (tab) => side.some((v) => v.id === tab)), own: side.filter((v) => !v.places.includes("center")) };
  }, []);
}

/** 列のアイコン 1 つ（プロジェクトの縦のタブと同じ .tab の見た目。押すとその中身で開く） */
function RailTab({
  label,
  icon,
  active,
  closes,
  className,
  ...rest
}: { label: string; icon: LucideIcon; active: boolean; closes: boolean } & Omit<ComponentProps<"button">, "title">) {
  return (
    <IconButton
      icon={icon}
      iconSize={14}
      role="tab"
      aria-selected={active}
      className={cx("tab side-rail-item", active && "active", className)}
      label={label}
      title={closes ? `${label}（押すと右サイドバーを閉じる）` : label}
      data-tip-side="left"
      {...rest}
    />
  );
}

/**
 * 右サイドバーの右端のアイコンの列（VS Code のアクティビティバーと同じ形）。
 * ブラウザが先頭で、その下はプロジェクトの縦のタブと同じまとまり・同じ見た目（.project-tab-group。2 つ以上のまとまりは薄い地でつなぎ、上のつまみで
 * まとまりごと動かす）。ドラッグで並べ替えられ、並びはプロジェクトのタブと共通（useProjectTabOrder の all で全体の並びに戻して覚える）。
 * 右サイドバーを閉じていても出し、押すとその中身で開く。開いている中身のアイコンをもう一度押すと閉じる。
 * 右サイドバーを別ウィンドウへ移している間（held）は、押すとそのウィンドウの中身を切り替えて前に出す。いちばん下は別ウィンドウで開く・前に出すボタン。
 * inWindow: 右サイドバーの別ウィンドウの中の列（切り替えるだけで、閉じない。別ウィンドウのボタンは出さない）
 */
export function SideRail({ projectId, open, held = false, inWindow = false }: { projectId: number; open: boolean; held?: boolean; inWindow?: boolean }) {
  const groups = useRailGroups();
  const order = useProjectTabOrder(groups.rail, true, groups.all);
  const view = useSideView(projectId);
  const shown = open || held || inWindow;
  const pick = (next: SideView) => {
    if (inWindow) return showSideView(projectId, next);
    if (!held && open && view === next) return setPanelOpen(panelKey("side", projectId), false);
    showSideView(projectId, next);
  };
  const tabState = (v: SideView) => {
    const active = shown && view === v;
    return { active, closes: active && !held && !inWindow, onClick: () => pick(v) };
  };
  return (
    <nav className={cx("side-rail", inWindow && "in-window")} aria-label="右サイドバーの中身">
      <div className="side-rail-items tabs project-side-tabs" role="tablist" aria-orientation="vertical">
        {/* 右サイドバーだけの中身（ブラウザ）は、並べ替えずにいつも先頭 */}
        {groups.own.map((v) => (
          <div key={v.id} className="project-tab-group" aria-label={v.label}>
            <RailTab label={v.label} icon={v.icon} {...tabState(v.id)} />
          </div>
        ))}
        {order.groups.map((group) => (
          <div key={group.key} className={cx("project-tab-group", group.tabs.length > 1 && "boxed")} {...order.groupAttrs(group)} aria-label={group.label} {...order.groupProps(group)}>
            {group.tabs.length > 1 && (
              <span className="project-tab-group-handle side-rail-handle" title={`ドラッグで「${group.label}」のまとまりごと動かす`} {...order.groupHandleProps(group)}>
                <GripHorizontal size={12} aria-hidden />
              </span>
            )}
            {group.tabs.map((t) => (
              <RailTab key={t.tab} label={t.label} icon={t.icon} {...order.tabAttrs(t.tab)} {...tabState(t.tab)} {...order.tabProps(group, t.tab)} />
            ))}
          </div>
        ))}
      </div>
      {!inWindow && canPopout() && (
        <IconButton
          icon={AppWindow}
          iconSize={14}
          className="side-rail-popout" active={held}
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
