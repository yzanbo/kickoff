import "./ChatsTab.css";
import type { ReopenRoute } from "@/foundation/ui/navigation/router";
import { useProjectChatsPanel } from "./useBoardPanel";
import { Panel, type PanelFrame } from "@/features/panel/ui";

/** チャットタブのパネルの枠（画面そのものなので閉じる・幅を変える・横幅いっぱいの切り替えを出さない） */
const FIXED_FRAME: PanelFrame = { fixed: true };

/**
 * プロジェクトの「チャット」タブ（チャットをボードと分ける置き方のとき）: ボードの右のパネルと同じパネル（タブ・分割・右の欄）を横幅いっぱいに出す。
 * ボードのカード・サイドバー・検索から開いたチャット・新しいチャット（focus）はここで開く。パネルはいつも開いておき、タブがなければ案内を出す
 * （画面そのもの = frame.fixed なので、Esc・最後のタブを閉じても、タブそのものは閉じない）
 */
export function ChatsTab({ projectId, focus }: { projectId: number; focus?: ReopenRoute }) {
  const panel = useProjectChatsPanel({ projectId, focus, tab: "chats" });
  return (
    <div className="chats-tab">
      <Panel panel={panel} frame={FIXED_FRAME} />
    </div>
  );
}
