import { SquarePen } from "lucide-react";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import type { PaneLeaf, PanelController } from "@/features/panel/ui";

/** チャットのパネルのタブのすぐ右の「新しいチャット」（このペインに、欄が決めた作成先で始める） */
export function ChatPanelAdds({ panel, pane }: { panel: PanelController; pane: PaneLeaf }) {
  return (
    <span className="panel-bar-buttons panel-tab-adds">
      <IconButton
        icon={SquarePen}
        label="新しいチャット"
        iconSize={14}
        onClick={() => {
          panel.focusPane(pane.id);
          panel.startNewChat();
        }}
      />
    </span>
  );
}
