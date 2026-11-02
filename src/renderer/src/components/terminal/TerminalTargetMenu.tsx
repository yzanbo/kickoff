import { SquareTerminal } from "lucide-react";
import { clampToViewport, MenuItem, PopupMenu } from "../PopupMenu";
import type { TerminalTarget } from "../sidePanel/useSidePanel";

/** メニューの位置（押したボタンの右端にそろえて、その下に出す） */
export function targetMenuAt(button: HTMLElement, count: number) {
  const r = button.getBoundingClientRect();
  return clampToViewport(r.right - 220, r.bottom + 4, 220, 16 + count * 34);
}

/**
 * どのプロジェクトでターミナルを開くかのメニュー（全プロジェクトの画面の、下のパネルの＋・ボードの「ターミナル」）。
 * ignore: メニューを開いたボタンのセレクタ（開いているときに押したら閉じる）
 */
export function TerminalTargetMenu({
  x,
  y,
  targets,
  ignore,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  targets: TerminalTarget[];
  ignore: string;
  onPick: (t: TerminalTarget) => void;
  onClose: () => void;
}) {
  return (
    <PopupMenu x={x} y={y} label="ターミナルを開く場所" ignore={ignore} onClose={onClose}>
      <div className="menu-label">ターミナルを開く場所</div>
      {targets.map((t) => (
        <MenuItem key={t.cwd} title={t.cwd} onSelect={() => onPick(t)}>
          <SquareTerminal size={14} /> {t.label}
        </MenuItem>
      ))}
    </PopupMenu>
  );
}
