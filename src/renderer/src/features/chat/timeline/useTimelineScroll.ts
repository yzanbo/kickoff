import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject, type UIEvent } from "react";
import { useLatest } from "@/hooks/useLatest";
import { SNAP_PX } from "@/lib/followScroll";
import { isKey } from "@/lib/keys";
import { useChatHotkey } from "@/features/chat/pane/chatHotkeys";
import { jumpToEvent } from "./jumpToEvent";
import type { TimelineScroll } from "./timelineScroll";
import { timelineView } from "./timelineView";
import type { TimelineWindow } from "./useTimelineWindow";

/** 一番下を見ているとみなす、下端からの距離（これより上にスクロールしたら、新しい発言に付いていかない。既読にするかもこれで見る） */
export const BOTTOM_SLACK_PX = 80;

/**
 * 流れのスクロール（ChatTimeline）:
 * - 一番下に付いていくかを、スクロールの位置で決める（付いていくのは useFollowBottom。上へ戻している途中（held）は、一番下の近くでも付き直さない）
 * - スクロールしたら窓に知らせる（描く範囲を決め直し、読んだ範囲の端に近づいたら読み足す。useRowWindow）
 * - 一番下へ戻る（遠ければ 1 画面手前まで一気に寄せてから、なめらかに。途中の一部分を出しているときは末尾に戻してから）。⌘↓ でも
 * - 検索結果から開いた発言（focus）を描いてから移り、一瞬強調する
 * - スクロールし終えたとき・流れを片付けるときに、読んでいた位置を見え方の店に覚える（一番下に付いていれば覚えない。開き直したときに使う。U2）
 * away は一番下から離れているか（一番下へ戻るボタンを出す）
 */
export function useTimelineScroll({
  chatId,
  scroll,
  root,
  window: w,
  focus,
  focused,
  backToTail,
}: {
  chatId: number;
  scroll: TimelineScroll;
  /** チャットの画面の要素（⌘↓ をこのチャットで受け取るか） */
  root: RefObject<HTMLElement | null>;
  window: TimelineWindow;
  focus?: number;
  /** 途中の一部分を出しているか（下の端まで来ても最新ではない） */
  focused: boolean;
  /** 途中の一部分をやめて末尾に戻す */
  backToTail: () => void;
}) {
  const [away, setAway] = useState(false);

  // 検索結果から開いたときは、その発言を描いてから移り、一瞬強調する（読んでいなければ、読めて流れに出たら）。
  // 移れたら覚え、同じ発言へは移り直さない（隠したタブを表に戻すと effect が流れ直し、読んでいた所から引き戻していた）
  const jumpedTo = useRef<number | undefined>(undefined);
  const { items } = w;
  const revealEvent = useEffectEvent((eventId: number) => w.revealEvent(eventId));
  useEffect(() => {
    if (!focus || focus === jumpedTo.current) return;
    let alive = true;
    void revealEvent(focus).then(() => {
      const el = scroll.ref.current;
      if (!alive || !el || focus === jumpedTo.current || !jumpToEvent(el, focus)) return;
      jumpedTo.current = focus;
      scroll.release();
    });
    return () => {
      alive = false;
    };
    // 流れの項目が変わるたびに試す（読み込んでから流れに出る）
  }, [focus, items, scroll]);

  // 途中の一部分から一番下へ戻る: 末尾に戻して、流れの項目が替わったら一番下へ
  const toTail = useRef(false);
  const toNewest = useEffectEvent(() => w.toNewest(false));
  useEffect(() => {
    if (!toTail.current || focused) return;
    toTail.current = false;
    void toNewest();
  }, [items, focused]);
  const scrollToBottom = () => {
    scroll.follow();
    if (focused) {
      toTail.current = true;
      backToTail();
      return;
    }
    void w.toNewest(true);
  };

  // ⌘↓ で一番下へ（このチャットの中にピントがあり、上を読んでいるとき。入力欄の中でも効く）
  useChatHotkey(
    root,
    (e) => isKey(e, "ArrowDown", { meta: true }),
    (e) => {
      e.preventDefault();
      scrollToBottom();
    },
    { enabled: away },
  );

  // 一番下を見ているか（付いていくか・一番下へ戻るボタンを出すか）を、いまの位置で決める
  const place = (el: HTMLElement) => {
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // 途中の一部分を描いているときは、下の端まで来ても最新ではない
    const atBottom = !focused && fromBottom < BOTTOM_SLACK_PX;
    // 上へ戻している途中は、一番下まで戻らない限り付き直さない（書いている途中に引き戻さない）
    if (atBottom && (!scroll.held() || fromBottom <= SNAP_PX)) scroll.follow();
    else if (!atBottom) scroll.release();
    setAway(!atBottom);
  };
  // 読んでいた位置を覚える（一番下に付いていれば覚えない。途中の一部分は開き直すと末尾から読むので覚えない。
  // 隠れていて測れないときは前の値を残す）
  const remember = () => {
    const view = timelineView(chatId);
    const last = w.last?.key;
    if (scroll.following() || focused || !last) {
      view.position = null;
      return;
    }
    const at = w.position();
    if (at) view.position = { ...at, last };
  };
  // 外したとき・隠したとき（Activity）は、最後に描いたときの値で覚える
  const rememberRef = useLatest(remember);
  useLayoutEffect(() => () => rememberRef.current(), [rememberRef]);

  // スクロールし終えた: 上へ戻している途中の印を外して、もう一度決める（一番下の近くで止まったら、また付いていく）
  const settle = (el: HTMLElement) => {
    scroll.settle();
    place(el);
    remember();
  };

  const onScroll = (e: UIEvent<HTMLElement>) => {
    place(e.currentTarget);
    w.onScroll();
  };

  return { away, onScroll, settle, scrollToBottom };
}
