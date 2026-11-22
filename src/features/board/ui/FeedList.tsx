import type { ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import type { Chat, FeedItem } from "@shared/chat/types";
import { ArchivableItems } from "@/features/chatList/ui";
import { EmptyState } from "@/foundation/ui/kit/EmptyState";

/**
 * フィード（全プロジェクトの画面）: チャットごとのメインエージェントの最新の返答を、返答の新しい順に 1 列に並べる。
 * 出すのは、ボードの絞り込み（名前・アーカイブ・作業場所・しまったプロジェクト）を通ったチャット（chats）の分だけ。アーカイブ済みは下の閉じたまとまり「アーカイブ済み n」へ。
 * 幅は画面いっぱいに使う。カードは useBoardCards の feedCard
 */
export function FeedList({
  items,
  chats,
  loaded,
  foldPlace,
  render,
}: {
  items: readonly FeedItem[];
  chats: readonly Chat[];
  loaded: boolean;
  /** アーカイブ済みのまとまりの開閉を覚える場所（ボードのほかのまとまりと同じ） */
  foldPlace: string;
  render: (chat: Chat, item: FeedItem) => ReactNode;
}) {
  const byId = new Map(chats.map((c) => [c.id, c]));
  const rows = items.flatMap((item) => {
    const chat = byId.get(item.chat_id);
    return chat ? [{ item, chat, archived_at: chat.archived_at }] : [];
  });
  if (!loaded) return <p className="muted small board-loading">読み込み中…</p>;
  return (
    <div className="board-feed">
      {rows.length === 0 ? (
        <EmptyState icon={MessageSquare} title="返答はまだありません">
          AI が返答すると、チャットごとに最新の返答がここに新しい順で並びます（絞り込み中なら、合うチャットのものだけ）。
        </EmptyState>
      ) : (
        // アーカイブ済みは、ほかのボードと同じく下の閉じたまとまり「アーカイブ済み n」へ（中は新しい順のまま）
        <ArchivableItems items={rows} render={({ item, chat }) => render(chat, item)} wrap="board-feed-list" foldPlace={foldPlace} foldKey="feed/archived" foldClass="archived-fold board-feed-list" />
      )}
    </div>
  );
}
