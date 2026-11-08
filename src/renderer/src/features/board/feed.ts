import { FEED_TEXT_LIMIT, type ChatEvent, type FeedItem } from "@shared/types";

// フィード（全プロジェクトの画面）: チャットごとのメインエージェントの最新の返答 1 件。読み込みは useFeed、ここは純粋な関数

/** 届いた記録がメインエージェントの返答なら、フィードの 1 件にする（サーバーの /api/feed と同じく、前後の空白を除いて初めの部分だけ） */
export function feedItemOf(event: ChatEvent): FeedItem | null {
  if (event.type !== "text" || event.data.parent) return null;
  const text = event.data.text.trim();
  if (!text) return null;
  return { chat_id: event.chat_id, event_id: event.id, text: text.length > FEED_TEXT_LIMIT ? `${text.slice(0, FEED_TEXT_LIMIT)}…` : text, created_at: event.created_at };
}

/** そのチャットの返答を新しいものに入れ替えて、いちばん前に置く（古い記録が遅れて届いたら、そのまま） */
export function upsertFeedItem(items: readonly FeedItem[], item: FeedItem): readonly FeedItem[] {
  const current = items.find((i) => i.chat_id === item.chat_id);
  if (current && current.event_id >= item.event_id) return items;
  return [item, ...items.filter((i) => i.chat_id !== item.chat_id)];
}

/**
 * 返答の初めの部分を、カードで読みやすい地の文にする（Markdown の印を外す: コードの囲み・見出しの #・強調・リンク・表の区切り）。
 * 段落の切れ目は 1 つの改行にまとめる
 */
export function feedPlainText(text: string): string {
  return text
    .replace(/^```[^\n]*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
