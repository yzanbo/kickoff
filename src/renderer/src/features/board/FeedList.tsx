import type { ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { busyWithUnread } from "@shared/chat/state";
import { AGENT_STATE_LABELS, type AgentState, type Chat, type FeedItem } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import { ChatTitleInput } from "@/features/chat/ChatTitleInput";
import type { ChatTitleEditor } from "@/features/chat/useChatRename";
import { GroupChip } from "@/features/group/GroupChip";
import { STATE_TONE } from "@/features/chat/tones";
import { ProjectChip } from "@/features/project/ProjectChip";
import { WorktreeChip } from "@/features/worktree/WorktreeChip";
import { formatFullDateTime, relativeTime } from "@/lib/time";
import { ArchivedFold, splitArchived } from "@/ui/ArchivedFold";
import { EmptyState } from "@/ui/EmptyState";
import { StatusDot } from "@/ui/StatusDot";
import { feedPlainText } from "./feed";

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
  // アーカイブ済みは、ほかのボードと同じく下の閉じたまとまり「アーカイブ済み n」へ（中は新しい順のまま）
  const [active, archived] = splitArchived(rows);
  if (!loaded) return <p className="muted small board-loading">読み込み中…</p>;
  return (
    <div className="board-feed">
      {rows.length === 0 ? (
        <EmptyState icon={MessageSquare} title="返答はまだありません">
          AI が返答すると、チャットごとに最新の返答がここに新しい順で並びます（絞り込み中なら、合うチャットのものだけ）。
        </EmptyState>
      ) : (
        <>
          {active.length > 0 && <div className="board-feed-list">{active.map(({ item, chat }) => render(chat, item))}</div>}
          <ArchivedFold place={foldPlace} foldKey="feed/archived" count={archived.length} bodyClassName="archived-fold board-feed-list">
            {archived.map(({ item, chat }) => render(chat, item))}
          </ArchivedFold>
        </>
      )}
    </div>
  );
}

/** フィードのカードの中身（プロジェクト・名前・グループ・作業場所・状態・返答の時刻、その下に返答の初めの部分） */
export function FeedCardContent({ chat, item, state, projectName, rename }: { chat: Chat; item: FeedItem; state: AgentState; projectName: string; rename?: ChatTitleEditor }) {
  return (
    <>
      <div className="feed-card-head">
        <ProjectChip id={chat.project_id} name={projectName} />
        {rename ? <ChatTitleInput chat={chat} editor={rename} /> : <span className="card-title one-line">{chatTitle(chat.title)}</span>}
        <GroupChip chat={chat} />
        <WorktreeChip chat={chat} />
        {chat.archived_at && <span className="archived-chip">アーカイブ済み</span>}
        <span className="feed-card-state">
          <StatusDot color={STATE_TONE[state]} />
          {AGENT_STATE_LABELS[state]}
          {busyWithUnread(chat, state) && <span className="card-unread">未読あり</span>}
        </span>
        <span className="card-time" title={formatFullDateTime(item.created_at)}>
          {relativeTime(item.created_at)}
        </span>
      </div>
      <p className="feed-card-text">{feedPlainText(item.text)}</p>
    </>
  );
}
