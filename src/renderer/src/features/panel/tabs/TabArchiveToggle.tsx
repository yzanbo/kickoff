import { Archive, ArchiveX } from "lucide-react";
import { cx } from "@/lib/cx";
import { useShowArchivedChats } from "@/features/chatList/chatListFlags";

/**
 * アーカイブ済みのチャットをタブに出すかの切り替え（タブのまとめ方のすぐ右）。サイドバーの見出しの「チャット」の行の「アーカイブ」と
 * 同じ設定（kickoff:sidebar-show-archived）なので、どちらで切り替えても両方がそろう。出しているときはアクセントの色
 */
export function TabArchiveToggle() {
  const [shown, setShown] = useShowArchivedChats();
  const label = shown ? "アーカイブ済みのチャットを隠す" : "アーカイブ済みのチャットを表示する";
  return (
    <button
      type="button"
      className={cx("panel-control", shown && "on")}
      title={`${label}（サイドバーの「アーカイブ」と共通）`}
      aria-label={label}
      aria-pressed={shown}
      onClick={() => setShown(!shown)}
    >
      {shown ? <Archive size={15} /> : <ArchiveX size={15} />}
    </button>
  );
}
