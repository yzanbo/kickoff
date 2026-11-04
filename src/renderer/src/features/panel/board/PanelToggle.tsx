import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { cx } from "@/lib/cx";
import type { PanelController } from "@/features/panel/usePanel";

/** ボードの見出し（「ボード／リスト」の右）に置く、パネルの開閉ボタン。閉じていて開いたタブがあれば数を出す */
export function PanelToggle({ panel }: { panel: PanelController }) {
  const { panelOpen, tabs } = panel;
  return (
    <button
      className={cx("icon-button panel-toggle", panelOpen && "active")}
      title={panelOpen ? "右側のパネルを閉じる（Esc）" : "右側のパネルを開く"}
      aria-label={panelOpen ? "右側のパネルを閉じる" : "右側のパネルを開く"}
      aria-pressed={panelOpen}
      onClick={() => panel.toggle()}
    >
      {panelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
      {!panelOpen && tabs.length > 0 && <span className="panel-toggle-count">{tabs.length}</span>}
    </button>
  );
}
