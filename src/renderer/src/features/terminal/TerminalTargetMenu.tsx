import { SquareTerminal } from "lucide-react";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import type { TerminalTarget } from "@/features/panel/usePanel";

/**
 * どのプロジェクトでターミナルを開くかのメニュー（全プロジェクトの画面の、下のパネルの＋・ボードの「ターミナル」）。
 * ignore: メニューを開いたボタンのセレクタ（開いているときに押したら閉じる）
 */
export function TerminalTargetMenu({
  at,
  targets,
  ignore,
  onPick,
  onClose,
}: {
  /** 置く場所（押したボタンの右端にそろえて、その下） */
  at: Placement;
  targets: readonly TerminalTarget[];
  ignore: string;
  onPick: (t: TerminalTarget) => void;
  onClose: () => void;
}) {
  return (
    <PopupMenu at={at} label="ターミナルを開く場所" ignore={ignore} onClose={onClose}>
      <div className="menu-label">ターミナルを開く場所</div>
      {targets.map((t) => (
        <MenuItem key={t.cwd} title={t.cwd} onSelect={() => onPick(t)}>
          <SquareTerminal size={14} /> {t.label}
        </MenuItem>
      ))}
    </PopupMenu>
  );
}
