import "./PanelToggle.css";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import type { PanelController } from "@/features/panel/ui";

/** ボードの見出し（「ボード／リスト」の右）に置く、パネルの開閉ボタン。閉じていて開いたタブがあれば数を出す */
export function PanelToggle({ panel }: { panel: PanelController }) {
  const { panelOpen, tabs } = panel;
  return (
    <IconButton
      icon={panelOpen ? PanelRightClose : PanelRightOpen}
      iconSize={15}
      className="panel-toggle"
      active={panelOpen}
      label={panelOpen ? "右側のパネルを閉じる" : "右側のパネルを開く"}
      keys={panelOpen ? "Esc" : undefined}
      aria-pressed={panelOpen}
      onClick={() => panel.toggle()}
      badge={!panelOpen && tabs.length > 0 ? <span className="panel-toggle-count">{tabs.length}</span> : undefined}
    />
  );
}
