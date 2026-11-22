import type { ReactNode } from "react";
import { Globe, SquareTerminal } from "lucide-react";
import type { PanelKind } from "./surface";

/**
 * タブがないときのパネル・ペインの中身: 案内（欄の EmptyHint か emptyHint の文。チャットの欄は新しいチャットのボタン、右の欄は新しい子チャットのボタンも）と、
 * ブラウザ・ターミナルを開くボタン（欄に出す種類 kinds のものだけ）
 */
export function PanelEmpty({
  hint,
  kinds,
  hasTerminals,
  manyTerminals,
  onBrowser,
  onTerminal,
}: {
  /** 案内（文なら控えめな段落にする） */
  hint: ReactNode;
  kinds: { has: (kind: PanelKind) => boolean };
  hasTerminals: boolean;
  /** 開く場所がいくつもある（押すとメニューを開く） */
  manyTerminals: boolean;
  onBrowser: () => void;
  onTerminal: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="panel-empty">
      {typeof hint === "string" ? <p className="muted small">{hint}</p> : hint}
      {kinds.has("browser") && (
        <button className="btn" onClick={onBrowser}>
          <Globe size={14} /> ブラウザを開く
        </button>
      )}
      {kinds.has("terminal") && hasTerminals && (
        <button className="btn panel-empty-terminal" aria-haspopup={manyTerminals ? "menu" : undefined} onClick={onTerminal}>
          <SquareTerminal size={14} /> ターミナルを開く
        </button>
      )}
    </div>
  );
}
