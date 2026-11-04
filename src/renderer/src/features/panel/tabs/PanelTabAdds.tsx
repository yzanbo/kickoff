import { ChevronDown, Globe, SquarePen, SquareTerminal } from "lucide-react";
import type { MouseEvent } from "react";
import { IconButton } from "@/ui/IconButton";
import type { PaneLeaf } from "@/features/panel/layout/paneLayout";
import type { SidePanelController } from "@/features/panel/usePanel";

/** ▾ のメニューの種類 */
export type OpenWithKind = "browser" | "terminal";

/**
 * ペインのタブの列の、タブのすぐ右の新しいタブのボタン（チャット・ブラウザ・ターミナル）。
 * ブラウザ・ターミナルは、アイコンで新しいタブ、横の ▾ で外のアプリで開くメニュー（2 つを 1 つのボタンに見せる .panel-split-button）
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
  panel: SidePanelController;
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
  const showChat = panel.kinds.has("chat");
  return (
    <span className="panel-bar-buttons panel-tab-adds">
      {/* 欄で隠している種類のボタンは出さない（表示するタブはタブの列の左の「表示するタブ」で選ぶ） */}
      {showChat && <IconButton icon={SquarePen} label="新しいチャット" size={14} onClick={onNewChat} />}
      {/* ブラウザ・ターミナルは、アイコンで新しいタブ、横の ▾ で外のアプリで開く・外のアプリを選ぶ（デスクトップアプリだけ） */}
      {panel.kinds.has("browser") && (
        <span className="panel-split-button">
          <IconButton icon={Globe} label="ブラウザを開く" title="ブラウザを新しいタブで開く" size={14} onClick={() => panel.openBrowser()} />
          {window.kickoff && (
            <IconButton
              icon={ChevronDown}
              label="ブラウザの開き方"
              title="新しいタブで開く・外のブラウザで開く・外のブラウザを選ぶ"
              size={12}
              className="panel-open-with panel-open-with-browser"
              aria-haspopup="menu"
              aria-expanded={openWithShown === "browser"}
              onClick={(e) => onOpenWith("browser", e, pane)}
            />
          )}
        </span>
      )}
      {panel.kinds.has("terminal") && terminals > 0 && (
        <span className="panel-split-button">
          <IconButton
            icon={SquareTerminal}
            label="ターミナルを開く"
            title="ターミナルを新しいタブで開く（チャットを表示しているときは、その作業場所で開く）"
            size={14}
            className="panel-tab-terminal"
            aria-haspopup={terminals > 1 ? "menu" : undefined}
            aria-expanded={terminals > 1 ? terminalMenuOpen : undefined}
            onClick={(e) => onTerminal(e, pane)}
          />
          <IconButton
            icon={ChevronDown}
            label="ターミナルの開き方"
            title="新しいタブで開く・外のターミナルで開く・外のターミナルを選ぶ"
            size={12}
            className="panel-open-with panel-open-with-terminal"
            aria-haspopup="menu"
            aria-expanded={openWithShown === "terminal"}
            onClick={(e) => onOpenWith("terminal", e, pane)}
          />
        </span>
      )}
    </span>
  );
}
