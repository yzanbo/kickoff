import { Archive, ArchiveX } from "lucide-react";
import { cx } from "@/lib/cx";
import { useShowArchivedChats } from "@/features/chatList/chatListFlags";
import { IconButton } from "@/ui/IconButton";

/**
 * アーカイブ済みのチャットをタブに出すかの切り替え（タブのまとめ方のすぐ右）。サイドバーの見出しの「チャット」の行の「アーカイブ」と
 * 同じ設定（kickoff:sidebar-show-archived）なので、どちらで切り替えても両方がそろう。出しているときはアクセントの色
 */
export function TabArchiveToggle() {
  const [shown, setShown] = useShowArchivedChats();
  const label = shown ? "アーカイブ済みのチャットを隠す" : "アーカイブ済みのチャットを表示する";
  return (
    <IconButton
      type="button"
      icon={shown ? Archive : ArchiveX}
      size={15}
      className={cx("panel-control", shown && "on")}
      label={label}
      title={`${label}（サイドバーの「アーカイブ」と共通）`}
      aria-pressed={shown}
      onClick={() => setShown(!shown)}
    />
  );
}
