import { Globe, SquarePen, SquareTerminal } from "lucide-react";
import { PopupMenu } from "../PopupMenu";
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
  const pick = (action: () => void) => {
    onClose();
    action();
  };
  return (
    <PopupMenu x={x} y={y} label="新しいタブ" ignore=".panel-tab-add" onClose={onClose}>
      <button role="menuitem" onClick={() => pick(onNewChat)}>
        <SquarePen size={14} /> 新しいチャット
      </button>
      <button role="menuitem" onClick={() => pick(onBrowser)}>
        <Globe size={14} /> ブラウザ
      </button>
      {terminals.length === 1 && (
        <button role="menuitem" onClick={() => pick(() => onTerminal(terminals[0]))}>
          <SquareTerminal size={14} /> ターミナル
        </button>
      )}
      {terminals.length > 1 && (
        <>
          <div className="menu-separator" role="separator" />
          <div className="menu-label">ターミナル</div>
          {terminals.map((target) => (
            <button key={target.cwd} role="menuitem" title={target.cwd} onClick={() => pick(() => onTerminal(target))}>
              <SquareTerminal size={14} /> {target.label}
            </button>
          ))}
        </>
      )}
    </PopupMenu>
  );
}
