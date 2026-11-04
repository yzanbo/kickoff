import { Group, Ungroup } from "lucide-react";
import { cx } from "@/lib/cx";
import { ChoiceMenu } from "@/ui/ChoiceMenu";
import { IconButton } from "@/ui/IconButton";
import { useContextMenu } from "@/ui/useContextMenu";
import { CHAT_GROUPING_LABELS, CHAT_GROUPINGS } from "@/features/chatList/chatGrouping";
import type { PanelSurface } from "@/features/panel/surfaces";
import { useTabGrouping } from "@/features/panel/clusters/useTabClusters";

/**
 * タブの列のまとめ方（見出しはサイドバーと同じ「チャットのまとめ方」）を選ぶボタン（パネルを閉じるボタンのすぐ右）。押すと下にメニューを開き、
 * まとめない・グループ別・作業場所別から選ぶ（欄ごとに覚える）。まとめているときはボタンをアクセントの色にする
 */
export function TabGroupingButton({ surface }: { surface: PanelSurface }) {
  const [grouping, setGrouping] = useTabGrouping(surface);
  const menu = useContextMenu();
  const label = `チャットのまとめ方: ${CHAT_GROUPING_LABELS[grouping]}`;
  return (
    <>
      <IconButton
        type="button"
        icon={grouping === "none" ? Ungroup : Group}
        size={15}
        className={cx("panel-control panel-tab-grouping", grouping !== "none" && "on")}
        label={label}
        title={`${label}（まとめない・グループ別・作業場所別から選ぶ）`}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        onClick={menu.toggle}
      />
      {menu.menu && (
        <ChoiceMenu
          at={menu.menu.at}
          title="チャットのまとめ方"
          values={CHAT_GROUPINGS}
          labels={CHAT_GROUPING_LABELS}
          value={grouping}
          ignore=".panel-tab-grouping"
          onPick={setGrouping}
          onClose={menu.close}
        />
      )}
    </>
  );
}
