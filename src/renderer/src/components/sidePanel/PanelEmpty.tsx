import { Globe, SquarePen, SquareTerminal } from "lucide-react";

/**
 * タブがないときのパネル・ペインの中身（新しいチャット・ブラウザ・ターミナルを開くボタン）。
 * ボードの右のパネルでは、新しいチャットの代わりに案内の文を出す（新しいチャットは見出しの「新規」から）
 */
export function PanelEmpty({
  showNewChat,
  hasTerminals,
  manyTerminals,
  onNewChat,
  onBrowser,
  onTerminal,
}: {
  showNewChat: boolean;
  hasTerminals: boolean;
  /** 開く場所がいくつもある（押すとメニューを開く） */
  manyTerminals: boolean;
  onNewChat: () => void;
  onBrowser: () => void;
  onTerminal: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="panel-empty">
      {showNewChat ? (
        <button className="btn" onClick={onNewChat}>
          <SquarePen size={14} /> 新しいチャット
        </button>
      ) : (
        <p className="muted small">カードを押すと、ここにチャットが開きます。</p>
      )}
      <button className="btn" onClick={onBrowser}>
        <Globe size={14} /> ブラウザを開く
      </button>
      {hasTerminals && (
        <button className="btn panel-empty-terminal" aria-haspopup={manyTerminals ? "menu" : undefined} onClick={onTerminal}>
          <SquareTerminal size={14} /> ターミナルを開く
        </button>
      )}
    </div>
  );
}
