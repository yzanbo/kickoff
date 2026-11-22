import { ChevronDown, Globe, SquareTerminal, type LucideIcon } from "lucide-react";
import { createContext, useContext, type ButtonHTMLAttributes } from "react";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { canOpenExternal } from "@/foundation/ui/external/native";
import type { PaneLeaf } from "@/features/panel/ui/layout/paneTree";
import type { PanelController } from "@/features/panel/ui/usePanel";
import type { OpenWithKind, OpenWithMenu } from "./useOpenWithMenu";

/** 欄のブラウザ・ターミナルを開く操作と ▾ のメニュー（Panel が 1 つ持ち、タブの列の新しいタブのボタンとタブがないときのボタンで同じものを使う） */
export const OpenWithContext = createContext<OpenWithMenu | null>(null);

/** アイコン ＋ ▾ の組（2 つを 1 つのボタンに見せる .panel-split-button。▾ は外で開ける Mac のアプリだけ） */
function SplitAdd({
  kind,
  pane,
  icon,
  caret,
}: {
  kind: OpenWithKind;
  pane: PaneLeaf;
  icon: { icon: LucideIcon; label: string; title: string } & ButtonHTMLAttributes<HTMLButtonElement>;
  caret: { label: string; title: string };
}) {
  const openWith = useContext(OpenWithContext);
  return (
    <span className="panel-split-button">
      <IconButton iconSize={14} {...icon} />
      {canOpenExternal() && openWith && (
        <IconButton
          icon={ChevronDown}
          label={caret.label}
          title={caret.title}
          iconSize={12}
          className={`panel-open-with panel-open-with-${kind}`}
          aria-haspopup="menu"
          aria-expanded={openWith.shown === kind}
          onClick={(e) => openWith.open(kind, e, pane)}
        />
      )}
    </span>
  );
}

/** ブラウザの欄（右サイドバー・ブラウザの別ウィンドウ）の新しいタブ: アイコンで新しいタブ、横の ▾ で外のブラウザで開くメニュー */
export function BrowserAdds({ panel, pane }: { panel: PanelController; pane: PaneLeaf }) {
  return (
    <span className="panel-bar-buttons panel-tab-adds">
      <SplitAdd
        kind="browser"
        pane={pane}
        icon={{ icon: Globe, label: "ブラウザを開く", title: "ブラウザを新しいタブで開く", onClick: () => panel.openBrowser() }}
        caret={{ label: "ブラウザの開き方", title: "新しいタブで開く・外のブラウザで開く・外のブラウザを選ぶ" }}
      />
    </span>
  );
}

/** ターミナルの欄（フッター）の新しいタブ: アイコンで新しいタブ（開く場所が決まらなければ選ぶメニュー）、横の ▾ で外のターミナルで開くメニュー。開ける場所がなければ出さない */
export function TerminalAdds({ pane }: { panel: PanelController; pane: PaneLeaf }) {
  const openWith = useContext(OpenWithContext);
  const terminals = openWith?.targets.length ?? 0;
  return (
    <span className="panel-bar-buttons panel-tab-adds">
      {terminals > 0 && openWith && (
        <SplitAdd
          kind="terminal"
          pane={pane}
          icon={{
            icon: SquareTerminal,
            label: "ターミナルを開く",
            title: "ターミナルを新しいタブで開く（チャットを表示しているときは、その作業場所で開く）",
            className: "panel-tab-terminal",
            "aria-haspopup": terminals > 1 ? "menu" : undefined,
            "aria-expanded": terminals > 1 ? openWith.picking : undefined,
            onClick: (e) => openWith.openTerminal(e, pane),
          }}
          caret={{ label: "ターミナルの開き方", title: "新しいタブで開く・外のターミナルで開く・外のターミナルを選ぶ" }}
        />
      )}
    </span>
  );
}
