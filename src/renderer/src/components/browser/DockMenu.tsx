import { Check } from "lucide-react";
import { MenuItem, PopupMenu } from "../PopupMenu";
import { DEVTOOLS_DOCK_LABELS, DEVTOOLS_DOCKS, type DevtoolsDock } from "./useDevtools";

/** 開発者ツールを出す場所のメニュー（右・下・別のウィンドウ）。選ぶと、その場所で開く */
export function DockMenu({ x, y, value, onPick, onClose }: { x: number; y: number; value: DevtoolsDock; onPick: (dock: DevtoolsDock) => void; onClose: () => void }) {
  return (
    <PopupMenu x={x} y={y} label="開発者ツールの場所" ignore=".browser-devtools-dock" onClose={onClose}>
      <div className="menu-label">開発者ツールの場所</div>
      {DEVTOOLS_DOCKS.map((dock) => (
        <MenuItem key={dock} role="menuitemradio" checked={dock === value} onSelect={() => onPick(dock)}>
          <span className="project-switch-item">{DEVTOOLS_DOCK_LABELS[dock]}</span>
          {dock === value && <Check size={14} aria-hidden />}
        </MenuItem>
      ))}
    </PopupMenu>
  );
}
