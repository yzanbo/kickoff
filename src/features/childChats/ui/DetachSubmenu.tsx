import { CornerLeftUp, Unplug } from "lucide-react";
import type { Chat } from "@shared/chat/types";
import { errorMessage } from "@shared/foundation/errors";
import { MenuSub } from "@/foundation/ui/kit/MenuFlyout";
import { chatTitle } from "@/features/chat/ui";
import { detachChild, raiseTargets } from "./detachChild";

/**
 * 子チャットの右クリックの「親から外す ▸」（横に開く子のメニュー）: 「親のないチャットにする…」と、孫より深いものは「「先祖の名前」の子にする…」（先祖ごとに 1 行。
 * 根から順）。どれも確かめてから外す（detachChild）。出す所: サイドバーの子の行（要対応の一覧の子の行も）・右の欄の子チャットのタブ（ChatMenuItems）・
 * 子チャットの画面の上の帯（ChildChatBar）。親の発言の下の札には出さない
 */
export function DetachSubmenu({ chat, onClose, onError }: { chat: Chat; onClose: () => void; onError: (message: string) => void }) {
  const ancestors = raiseTargets(chat);
  const run = (parentId: number | null) => {
    onClose();
    void detachChild(chat, { parentId }).catch((e: unknown) => onError(errorMessage(e)));
  };
  return (
    <MenuSub icon={<Unplug size={14} />} label="親から外す" menuLabel="親から外す">
      <button role="menuitem" autoFocus onClick={() => run(null)}>
        <Unplug size={14} aria-hidden /> 親のないチャットにする…
      </button>
      {ancestors.map((a) => (
        <button key={a.id} role="menuitem" onClick={() => run(a.id)}>
          <CornerLeftUp size={14} aria-hidden /> 「{chatTitle(a.title)}」の子にする…
        </button>
      ))}
    </MenuSub>
  );
}
