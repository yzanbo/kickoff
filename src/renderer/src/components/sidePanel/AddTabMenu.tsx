import { Globe, SquarePen, SquareTerminal } from "lucide-react";
import { MenuItem, PopupMenu } from "../PopupMenu";
import type { TerminalTarget } from "./useSidePanel";

/** タブの列の＋のメニューの高さ（画面からはみ出さない位置を決めるため） */
export const addMenuHeight = (terminals: number) => 90 + (terminals === 1 ? 34 : terminals > 1 ? 40 + terminals * 34 : 0);

/**
 * タブの列の＋のメニュー: 新しいチャット・ブラウザ・ターミナルのタブを開く。
 * ターミナルは開く場所が 1 つ（プロジェクトのボード）なら 1 項目、いくつもある（全プロジェクトのボード）ならプロジェクトごとに並べる
 */
export function AddTabMenu({
  x,
  y,
  onNewChat,
  onBrowser,
  terminals,
  onTerminal,
  onClose,
}: {
  x: number;
  y: number;
  onNewChat: () => void;
  onBrowser: () => void;
  terminals: TerminalTarget[];
  onTerminal: (target: TerminalTarget) => void;
  onClose: () => void;
}) {
  return (
    <PopupMenu x={x} y={y} label="新しいタブ" ignore=".panel-tab-add" onClose={onClose}>
      <MenuItem onSelect={onNewChat}>
        <SquarePen size={14} /> 新しいチャット
      </MenuItem>
      <MenuItem onSelect={onBrowser}>
        <Globe size={14} /> ブラウザ
      </MenuItem>
      {terminals.length === 1 && (
        <MenuItem onSelect={() => onTerminal(terminals[0])}>
          <SquareTerminal size={14} /> ターミナル
        </MenuItem>
      )}
      {terminals.length > 1 && (
        <>
          <div className="menu-separator" role="separator" />
          <div className="menu-label">ターミナル</div>
          {terminals.map((target) => (
            <MenuItem key={target.cwd} title={target.cwd} onSelect={() => onTerminal(target)}>
              <SquareTerminal size={14} /> {target.label}
            </MenuItem>
          ))}
        </>
      )}
    </PopupMenu>
  );
}
