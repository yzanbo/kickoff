// チャットのパネル・チャットの別ウィンドウの「新しいチャット」のボタン（欄の Adds と EmptyHint）
import { SquarePen } from "lucide-react";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import type { PaneLeaf, PanelController } from "@/features/panel/ui";
import { startNewChat } from "./startNewChat";

/** タブのすぐ右の「新しいチャット」（このペインに、欄が決めた作成先で始める） */
export function ChatPanelAdds({ panel, pane }: { panel: PanelController; pane: PaneLeaf }) {
  return (
    <span className="panel-bar-buttons panel-tab-adds">
      <IconButton
        icon={SquarePen}
        label="新しいチャット"
        iconSize={14}
        onClick={() => {
          panel.focusPane(pane.id);
          startNewChat(panel);
        }}
      />
    </span>
  );
}

/**
 * タブがないとき: 案内の文があり分けていなければ案内（ボードの分けていないパネル。新しいチャットは見出しの「新規」から）、
 * そうでなければ新しいチャットのボタン（分けたペイン・案内のない欄）
 */
export function ChatPanelEmpty({ panel, hint }: { panel: PanelController; pane: PaneLeaf; hint: string | undefined }) {
  if (hint && panel.layout.root.type === "pane") return <p className="muted small">{hint}</p>;
  return (
    <button className="btn" onClick={() => startNewChat(panel)}>
      <SquarePen size={14} /> 新しいチャット
    </button>
  );
}
