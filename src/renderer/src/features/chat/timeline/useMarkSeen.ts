import { useEffect, useRef, type RefObject } from "react";
import { isUnreadEvent } from "@shared/chat/state";
import type { Chat, ChatEvent } from "@shared/types";
import { api } from "@/api";
import { useWindowFocused } from "@/hooks/useWindowFocused";

/**
 * 最新の結果を一番下まで見たら既読にする（作業中の返答も、終わった結果も同じ）。
 * 見たことにするのは、チャットを表示していて（visible）、Kickoff が前にあり、流れの一番下が見えているときだけ。
 * 送るのは、新しい結果が届いた・一番下まで来た・表示した・Kickoff に戻ってきたとき。
 * 見ている間に右クリックの「未読にする」で付けた印は、次にこれらが起きるまで残す。
 * サーバーには一番下まで見た記録の id を渡し、それより新しい返答が届いていれば未読のまま残してもらう
 */
export function useMarkSeen({
  timelineRef,
  chat,
  events,
  visible,
  away,
  slackPx,
}: {
  timelineRef: RefObject<HTMLDivElement | null>;
  chat: Chat;
  events: ChatEvent[];
  visible: boolean;
  /** 一番下から離れているか（スクロールで変わる） */
  away: boolean;
  /** 一番下と見なす余白 */
  slackPx: number;
}) {
  const focused = useWindowFocused();
  const lastEventId = events.at(-1)?.id ?? 0;
  const lastUnreadId = events.findLast(isUnreadEvent)?.id ?? 0;
  // 見たと送った「新しい結果」の id（同じ結果で何度も送らない）。チャットが替われば数え直す
  const sent = useRef({ chatId: chat.id, upTo: 0 });
  if (sent.current.chatId !== chat.id) sent.current = { chatId: chat.id, upTo: 0 };
  const unread = useRef(chat.unread);
  unread.current = chat.unread;

  useEffect(() => {
    const el = timelineRef.current;
    if (!visible || !focused || away || !el) return;
    // スクロールの知らせより先に動くことがある（開いた発言へ移った直後など）ので、いまの位置で確かめる
    if (el.scrollHeight - el.scrollTop - el.clientHeight >= slackPx) return;
    if (!unread.current && lastUnreadId <= sent.current.upTo) return;
    sent.current.upTo = lastUnreadId;
    void api.markSeen(chat.id, lastEventId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, focused, away, lastUnreadId, chat.id]);
}
