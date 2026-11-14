import { ChevronRight, CornerLeftUp, Unplug } from "lucide-react";
import type { Chat } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { MenuFlyout, useSubmenu } from "@/ui/MenuFlyout";
import { chatTitle } from "@/features/chat/chatTitle";
import { detachChild, raiseTargets } from "./detachChild";

/**
 * 子チャットの右クリックの「親から外す ▸」（横に開く子のメニュー）: 「親のないチャットにする…」と、孫より深いものは「「先祖の名前」の子にする…」（先祖ごとに 1 行。
 * 根から順）。どれも確かめてから外す（detachChild）。出す所: サイドバーの子の行（要対応の一覧の子の行も）・右の欄の子チャットのタブ（ChatMenuItems）・
 * 子チャットの画面の上の帯（ChildChatBar）。親の発言の下の札には出さない（2026-11-14 に利用者と決めた）
 */
export function DetachSubmenu({ chat, onClose, onError }: { chat: Chat; onClose: () => void; onError: (message: string) => void }) {
  const sub = useSubmenu();
  const ancestors = raiseTargets(chat);
  const run = (parentId: number | null) => {
    onClose();
    void detachChild(chat, { parentId }).catch((e: unknown) => onError(errorMessage(e)));
  };
  return (
    <>
      <button {...sub.trigger}>
        <Unplug size={14} /> 親から外す
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {sub.anchor && (
        <MenuFlyout anchor={sub.anchor} label="親から外す" onBack={sub.back}>
          <button role="menuitem" autoFocus onClick={() => run(null)}>
            <Unplug size={14} aria-hidden /> 親のないチャットにする…
          </button>
          {ancestors.map((a) => (
            <button key={a.id} role="menuitem" onClick={() => run(a.id)}>
              <CornerLeftUp size={14} aria-hidden /> 「{chatTitle(a.title)}」の子にする…
            </button>
          ))}
        </MenuFlyout>
      )}
    </>
  );
}
