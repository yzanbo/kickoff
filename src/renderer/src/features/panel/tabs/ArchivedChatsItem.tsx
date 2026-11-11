import { Check } from "lucide-react";
import { useSetting } from "@/hooks/useSetting";
import { PANEL_SHOW_ARCHIVED } from "@/lib/storageKeys";
import { MenuItem } from "@/ui/PopupMenu";

/**
 * 「アーカイブ済みのチャットを表示」（PANEL_SHOW_ARCHIVED。パネルのチャットのタブだけの設定で、サイドバーの「アーカイブ」とは別。初めは隠す）。
 * パネルのタブの列の「表示」のメニュー・タブの右クリックの「タブの表示 ›」と、まとまりの札の右クリックに置く
 */
export function ArchivedChatsItem() {
  const [archived, setArchived] = useSetting(PANEL_SHOW_ARCHIVED);
  return (
    <MenuItem role="menuitemcheckbox" checked={archived} title="タブの列だけの設定です（サイドバーの「アーカイブ」とは別）" onSelect={() => setArchived(!archived)}>
      <span className="project-switch-item">アーカイブ済みのチャットを表示</span>
      {archived && <Check size={14} aria-hidden />}
    </MenuItem>
  );
}
