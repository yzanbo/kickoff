import { Check } from "lucide-react";
import { MenuItem } from "@/ui/PopupMenu";
import { useShowArchivedChats } from "./chatListFlags";

/**
 * 「アーカイブ済みのチャットを表示」（SIDEBAR_SHOW_ARCHIVED。サイドバーの「アーカイブ」と共通）。
 * パネルのタブの列の「表示」のメニュー・タブの右クリックの「タブの表示 ›」と、まとまりの札の右クリックに置く
 */
export function ArchivedChatsItem() {
  const [archived, setArchived] = useShowArchivedChats();
  return (
    <MenuItem role="menuitemcheckbox" checked={archived} title="サイドバーの「アーカイブ」と共通の設定です" onSelect={() => setArchived(!archived)}>
      <span className="project-switch-item">アーカイブ済みのチャットを表示</span>
      {archived && <Check size={14} aria-hidden />}
    </MenuItem>
  );
}
