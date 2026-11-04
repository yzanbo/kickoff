import { ChevronDown, Globe, SquarePen, SquareTerminal, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { IconButton } from "@/ui/IconButton";
import type { OpenWithKind } from "@/features/openWith/useOpenWithMenu";
import type { PaneLeaf } from "@/features/panel/layout/paneTree";
import type { PanelController } from "@/features/panel/usePanel";

/**
 * ペインのタブの列の、タブのすぐ右の新しいタブのボタン（チャット・ブラウザ・ターミナル）。
 * ブラウザ・ターミナルは、アイコンで新しいタブ、横の ▾ で外のアプリで開くメニュー（2 つを 1 つのボタンに見せる .panel-split-button）。
 * 欄で隠している種類のボタンは出さない（表示するタブはタブの列の左の「表示するタブ」で選ぶ）
 */
export function PanelTabAdds({
  panel,
  pane,
  terminals,
  terminalMenuOpen,
  onNewChat,
  onTerminal,
  onOpenWith,
  openWithShown,
}: {
  panel: PanelController;
  pane: PaneLeaf;
  /** 開けるターミナルの場所の数（0 なら出さない） */
  terminals: number;
  terminalMenuOpen: boolean;
  onNewChat: () => void;
  onTerminal: (e: MouseEvent<HTMLButtonElement>, pane: PaneLeaf) => void;
  /** ブラウザ・ターミナルの ▾（新しいタブ・外のアプリで開く） */
  onOpenWith: (kind: OpenWithKind, e: MouseEvent<HTMLButtonElement>, pane: PaneLeaf) => void;
  /** いま開いている ▾ のメニュー（aria-expanded に使う） */
  openWithShown: OpenWithKind | null;
}) {
  /** アイコン ＋ ▾ の組（▾ はデスクトップアプリだけ） */
  const split = (kind: OpenWithKind, icon: { icon: LucideIcon; label: string; title: string } & ButtonHTMLAttributes<HTMLButtonElement>, caret: { label: string; title: string }) => (
    <span className="panel-split-button">
      <IconButton size={14} {...icon} />
      {window.kickoff && (
        <IconButton
          icon={ChevronDown}
          label={caret.label}
          title={caret.title}
          size={12}
          className={`panel-open-with panel-open-with-${kind}`}
          aria-haspopup="menu"
          aria-expanded={openWithShown === kind}
          onClick={(e) => onOpenWith(kind, e, pane)}
        />
      )}
    </span>
  );
  return (
    <span className="panel-bar-buttons panel-tab-adds">
      {panel.kinds.has("chat") && <IconButton icon={SquarePen} label="新しいチャット" size={14} onClick={onNewChat} />}
      {panel.kinds.has("browser") &&
        split(
          "browser",
          { icon: Globe, label: "ブラウザを開く", title: "ブラウザを新しいタブで開く", onClick: () => panel.openBrowser() },
          { label: "ブラウザの開き方", title: "新しいタブで開く・外のブラウザで開く・外のブラウザを選ぶ" },
        )}
      {panel.kinds.has("terminal") &&
        terminals > 0 &&
        split(
          "terminal",
          {
            icon: SquareTerminal,
            label: "ターミナルを開く",
            title: "ターミナルを新しいタブで開く（チャットを表示しているときは、その作業場所で開く）",
            className: "panel-tab-terminal",
            "aria-haspopup": terminals > 1 ? "menu" : undefined,
            "aria-expanded": terminals > 1 ? terminalMenuOpen : undefined,
            onClick: (e) => onTerminal(e, pane),
          },
          { label: "ターミナルの開き方", title: "新しいタブで開く・外のターミナルで開く・外のターミナルを選ぶ" },
        )}
    </span>
  );
}
