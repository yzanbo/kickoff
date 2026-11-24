import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import { isUnreadEvent } from "@shared/chat/state";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { Chat } from "@shared/chat/types";
import { chatsApi } from "@/features/chat/ui";
import { useWindowFocused } from "@/foundation/ui/hooks/useWindowFocused";

/** 自分で見ていると数える操作（チャットの画面の中のスクロール・クリック・キー入力） */
const ACTIVITY_EVENTS = ["wheel", "pointerdown", "keydown", "touchstart"] as const;
/** 操作のあと、スクロールが落ち着いてから一番下かを確かめるまでの間（ms。トラックパッドの慣性のスクロールの分） */
const SETTLE_MS = 150;

/**
 * 最新の結果を一番下まで見たら既読にする（作業中の返答も、終わった結果も同じ）。
 * 見たことにするのは、チャットを表示していて（visible）、Kickoff が前にあり、流れの一番下が見えているときだけ。
 * 送るのは、自分で見たとき = チャットを表示した・一番下まで来た・チャットの画面の中でスクロール・クリック・キー入力したとき。
 * 開いたまま一番下に付いていても、新しい結果が届いただけ・Kickoff に戻っただけでは既読にしない
 * （分けたペインで隣のチャットを見ている間・ほかのアプリを見ている間に届いた返答も、サイドバー・タブの緑の点で気づけるように）。
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

  /**
   * いま一番下が見えていて、まだ見たと送っていない結果があれば既読にする。
   * 確かめるときにいまの値を読む（effect event。新しい結果が届いたことは、確かめるきっかけにしない）
   */
  const check = useEffectEvent(() => {
    const el = timelineRef.current;
    if (!visible || !focused || !el) return;
    // スクロールの知らせより先に動くことがある（開いた発言へ移った直後など）ので、いまの位置で確かめる
    if (el.scrollHeight - el.scrollTop - el.clientHeight >= slackPx) return;
    if (sent.current.chatId !== chat.id) sent.current = { chatId: chat.id, upTo: 0 };
    if (!chat.unread && lastUnreadId <= sent.current.upTo) return;
    sent.current.upTo = lastUnreadId;
    void chatsApi.markSeen(chat.id, lastEventId).catch(() => {});
  });

  // 表示した・一番下まで来た・チャットが替わったとき。裏のタブを表に戻した直後は、裏の間に増えた分へ一番下を寄せる前に
  // 流れることがあるので、落ち着いてからもう一度確かめる（会話の欄は Activity で止めるので、表に戻すと effect が流れ直す）
  useEffect(() => {
    if (away) return;
    check();
    const timer = setTimeout(() => check(), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [visible, away, chat.id]);

  // チャットの画面の中で自分でスクロール・クリック・キー入力したとき（一番下に付いたまま見ている間も、操作すれば見たことにする）
  useEffect(() => {
    const el = timelineRef.current;
    if (!visible || !el) return;
    const root = el.closest<HTMLElement>(".chat-page") ?? el;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onActivity = (e: Event) => {
      // 右の欄に入れ子で開いた子チャットなど、中のほかのチャットの画面での操作は数えない
      if (e.target instanceof Element && e.target.closest(".chat-page") !== root && root !== el) return;
      clearTimeout(timer);
      timer = setTimeout(() => check(), SETTLE_MS);
    };
    for (const type of ACTIVITY_EVENTS) root.addEventListener(type, onActivity, { capture: true, passive: true });
    return () => {
      clearTimeout(timer);
      for (const type of ACTIVITY_EVENTS) root.removeEventListener(type, onActivity, { capture: true });
    };
  }, [visible, chat.id, timelineRef]);
}
