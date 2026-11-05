import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import { panelActions } from "@/features/panel/state/panelActions";
import { usePanelOpen } from "@/features/panel/state/panelStore";
import { panelKey } from "@/features/panel/surfaces";

/**
 * チャットの見出しの右端の、右の欄（そのチャットのサブエージェント・変更・ファイル・メモ・子チャットのタブ）を開く・閉じるボタン。
 * アイコンは右の欄の左上の閉じるボタンと同じ形で、開いているときは閉じる向き（PanelRightClose）、閉じているときは開く向き（PanelRightOpen）。
 * 開いているときはアクセントの色。タブがなくても開け、そのときは何を開けるかの案内を出す（SURFACES.agents の emptyHint）
 */
export function AgentPanelToggle({ chatId }: { chatId: number }) {
  const key = panelKey("agents", chatId);
  const open = usePanelOpen(key);
  return (
    <IconButton
      icon={open ? PanelRightClose : PanelRightOpen}
      label={open ? "右の欄を閉じる" : "右の欄を開く"}
      title={open ? "右の欄を閉じる（タブは残る）" : "右の欄を開く（サブエージェント・変更・ファイル・メモ・子チャットのタブ）"}
      aria-pressed={open}
      className={cx("chat-agents-toggle", open && "on")}
      onClick={() => panelActions(key).toggle()}
    />
  );
}
