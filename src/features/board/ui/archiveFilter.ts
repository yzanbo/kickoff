import type { Chat } from "@shared/chat/types";
import type { BoardViewState } from "./layout";

/**
 * アーカイブでの絞り込み（all: すべて / active: 未アーカイブ / archived: アーカイブ済み）。ボードの見え方の一部（layout.ts の archive）。
 * サイドバー・右のパネルのタブの「アーカイブ済みを出すか」とは連動しない（連動すると、サイドバーのビュー「標準」（アーカイブ済みを出す）と
 * ボードのビュー（未アーカイブ）が同じ設定を取り合い、ボードを開いてもどのビューも選ばれていない形になる）
 */
export type ArchiveFilter = BoardViewState["archive"];

/** そのチャットを出すか（未アーカイブのときはアーカイブ済みを、アーカイブ済みのときは未アーカイブを出さない） */
export const archiveMatches = (chat: Pick<Chat, "archived_at">, filter: ArchiveFilter) => filter === "all" || (filter === "archived") === Boolean(chat.archived_at);
