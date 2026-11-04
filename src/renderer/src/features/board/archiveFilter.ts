import type { Chat } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import type { Setting, SettingValue } from "@/lib/storage";
import type { BOARD_ARCHIVE_FILTER } from "@/lib/storageKeys";
import { useShowArchivedChats } from "@/features/chatList/chatListFlags";

/** アーカイブでの絞り込み（all: すべて / active: 未アーカイブ / archived: アーカイブ済み）。カンバンとグループのボードで共通 */
export type ArchiveFilter = SettingValue<typeof BOARD_ARCHIVE_FILTER>;

/**
 * ボードの絞り込みの値（純粋関数）。アーカイブ済みを出すかはサイドバー・右のパネルのタブと共通の設定（shown）で決め、
 * 出しているときだけ、ボードで覚えた「アーカイブ済みだけ」（stored）を効かせる
 */
export const linkedArchiveFilter = (shown: boolean, stored: ArchiveFilter): ArchiveFilter => (!shown ? "active" : stored === "archived" ? "archived" : "all");

/**
 * アーカイブでの絞り込み。サイドバー・右のパネルのタブと連動する（kickoff:sidebar-show-archived）: 「すべて」「アーカイブ済み」を選ぶと
 * どこでもアーカイブ済みを出し、「未アーカイブ」を選ぶとどこでも隠す（サイドバー・タブで切り替えても、ボードも同じになる）。
 * 「アーカイブ済みだけ」はボードの中だけの絞り込みとして、ボードごとに setting で覚える（カンバン・グループのボード）
 */
export function useArchiveFilter(setting: Setting<ArchiveFilter>): [ArchiveFilter, (value: ArchiveFilter) => void] {
  const [shown, setShown] = useShowArchivedChats();
  const [stored, setStored] = useSetting(setting);
  const set = (value: ArchiveFilter) => {
    setStored(value);
    setShown(value !== "active");
  };
  return [linkedArchiveFilter(shown, stored), set];
}

/** そのチャットを出すか（未アーカイブのときはアーカイブ済みを、アーカイブ済みのときは未アーカイブを出さない） */
export const archiveMatches = (chat: Pick<Chat, "archived_at">, filter: ArchiveFilter) => filter === "all" || (filter === "archived") === Boolean(chat.archived_at);
