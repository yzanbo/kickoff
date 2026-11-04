import { Group, Ungroup } from "lucide-react";
import { cx } from "../../cx";
import { ChoiceMenu } from "../menus/ChoiceMenu";
import { useAnchoredMenu } from "../menus/useAnchoredMenu";
import { TAB_GROUPING_LABELS, TAB_GROUPINGS } from "./tabClusters";
import type { PanelSurface } from "./panelKinds";
import { useTabGrouping } from "./useTabClusters";

const MENU_WIDTH = 200;

/**
 * タブの列のまとめ方を選ぶボタン（パネルを閉じるボタンのすぐ右）。押すと下にメニューを開き、
 * まとめない・グループ別・作業場所別から選ぶ（欄ごとに覚える）。まとめているときはボタンをアクセントの色にする
 */
export function TabGroupingButton({ surface }: { surface: PanelSurface }) {
  const [grouping, setGrouping] = useTabGrouping(surface);
  const menu = useAnchoredMenu(".panel-tab-grouping", MENU_WIDTH);
  const label = `タブのまとめ方: ${TAB_GROUPING_LABELS[grouping]}`;
  return (
    <>
      <button
        type="button"
        className={cx("panel-control panel-tab-grouping", grouping !== "none" && "on")}
        title={`${label}（まとめない・グループ別・作業場所別から選ぶ）`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        onClick={(e) => menu.toggle(e, 130)}
      >
        {grouping === "none" ? <Ungroup size={15} /> : <Group size={15} />}
      </button>
      {menu.at && (
        <ChoiceMenu
          x={menu.at.x}
          y={menu.at.y}
          title="タブのまとめ方"
          values={TAB_GROUPINGS}
          labels={TAB_GROUPING_LABELS}
          value={grouping}
          ignore={menu.ignore}
          onPick={setGrouping}
          onClose={menu.close}
        />
      )}
    </>
  );
}
