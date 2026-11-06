import { Globe, MessageSquarePlus, SquarePen, SquareTerminal } from "lucide-react";
import type { PanelKind } from "@/features/panel/state/panelKinds";

/**
 * タブがないときのパネル・ペインの中身（新しいチャット・ブラウザ・ターミナルを開くボタン）。
 * hint があれば、新しいチャットの代わりにその案内の文を出す（ボードの分けていないパネル。新しいチャットは見出しの「新規」から）。
 * チャットを出さない欄でも、hint があれば出す（サブエージェントの欄。中身は外から開くタブだけなので、開き方を案内する）。
 * サブエージェントの欄では、案内の下に新しい子チャットのボタンも出す（onNewChild）。欄で隠している種類（kinds）のボタンは出さない
 */
export function PanelEmpty({
  hint,
  kinds,
  hasTerminals,
  manyTerminals,
  onNewChat,
  onNewChild,
  onBrowser,
  onTerminal,
}: {
  hint?: string;
  kinds: { has: (kind: PanelKind) => boolean };
  hasTerminals: boolean;
  /** 開く場所がいくつもある（押すとメニューを開く） */
  manyTerminals: boolean;
  onNewChat: () => void;
  /** 新しい子チャットを開く（サブエージェントの欄で、欄のチャットが子チャットを作れるときだけ） */
  onNewChild: (() => void) | null;
  onBrowser: () => void;
  onTerminal: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="panel-empty">
      {!kinds.has("chat") && hint && <p className="muted small">{hint}</p>}
      {kinds.has("chat") &&
        (hint ? (
          <p className="muted small">{hint}</p>
        ) : (
          <button className="btn" onClick={onNewChat}>
            <SquarePen size={14} /> 新しいチャット
          </button>
        ))}
      {onNewChild && (
        <button className="btn" onClick={onNewChild}>
          <MessageSquarePlus size={14} /> 新しい子チャット
        </button>
      )}
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
