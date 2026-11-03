import { ArrowRightLeft, Columns2, Rows2, X } from "lucide-react";
import { MenuItem, PopupMenu } from "../PopupMenu";
import { leavesOf, paneOfTab } from "./paneLayout";
import type { SidePanelController } from "./useSidePanel";

/** タブの右クリックのメニューの、おおよその大きさ（画面からはみ出さない位置にするため） */
export const TAB_MENU_WIDTH = 220;
export const tabMenuHeight = (panes: number) => 120 + (panes > 1 ? panes * 32 : 0);

/**
 * 右のパネルのタブの右クリックのメニュー: 右・下に分けて開く、ほかのペインへ移す（ペインが 2 つ以上のとき。ペインは並び順の番号で呼ぶ）、閉じる
 */
export function TabMenu({ panel, tabKey, x, y, onClose }: { panel: SidePanelController; tabKey: string; x: number; y: number; onClose: () => void }) {
  const pane = paneOfTab(panel.layout, tabKey);
  if (!pane) return null;
  const panes = leavesOf(panel.layout.root);
  return (
    <PopupMenu x={x} y={y} label="タブのメニュー" onClose={onClose}>
      <MenuItem onSelect={() => panel.splitPane(pane.id, "row", "after", tabKey)}>
        <Columns2 size={14} /> 右に分けて開く
      </MenuItem>
      <MenuItem onSelect={() => panel.splitPane(pane.id, "column", "after", tabKey)}>
        <Rows2 size={14} /> 下に分けて開く
      </MenuItem>
      {panes.length > 1 &&
        panes.map((p, i) =>
          p.id === pane.id ? null : (
            <MenuItem key={p.id} onSelect={() => panel.moveTab(tabKey, p.id)}>
              <ArrowRightLeft size={14} /> ペイン {i + 1} へ移す
            </MenuItem>
          ),
        )}
      <MenuItem onSelect={() => panel.closeTab(tabKey)}>
        <X size={14} /> タブを閉じる
      </MenuItem>
    </PopupMenu>
  );
}
