import { ChoiceMenu } from "@/ui/ChoiceMenu";
import { DEVTOOLS_DOCK_LABELS, DEVTOOLS_DOCKS, type DevtoolsDock } from "./useDevtools";

/** 開発者ツールを出す場所のメニュー（右・下・別のウィンドウ）。選ぶと、その場所で開く */
export function DockMenu({ x, y, value, onPick, onClose }: { x: number; y: number; value: DevtoolsDock; onPick: (dock: DevtoolsDock) => void; onClose: () => void }) {
  return (
    <ChoiceMenu x={x} y={y} title="開発者ツールの場所" values={DEVTOOLS_DOCKS} labels={DEVTOOLS_DOCK_LABELS} value={value} ignore=".browser-devtools-dock" onPick={onPick} onClose={onClose} />
  );
}
