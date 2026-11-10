import type { Chat } from "@shared/types";
import type { SettingValue } from "@/lib/storage";
import type { BOARD_ARCHIVE_FILTER } from "@/lib/storageKeys";

/**
 * アーカイブでの絞り込み（all: すべて / active: 未アーカイブ / archived: アーカイブ済み）。すべてのボードで共通（BOARD_ARCHIVE_FILTER）。
 * サイドバー・右のパネルのタブの「アーカイブ済みを出すか」とは連動しない（利用者の依頼。前は連動していて、サイドバーのビュー「標準」（アーカイブ済みを出す）と
 * ボードのビュー（未アーカイブ）が同じ設定を取り合い、ボードを開いてもどのビューも選ばれていない形になった）
 */
export type ArchiveFilter = SettingValue<typeof BOARD_ARCHIVE_FILTER>;

/** そのチャットを出すか（未アーカイブのときはアーカイブ済みを、アーカイブ済みのときは未アーカイブを出さない） */
export const archiveMatches = (chat: Pick<Chat, "archived_at">, filter: ArchiveFilter) => filter === "all" || (filter === "archived") === Boolean(chat.archived_at);
