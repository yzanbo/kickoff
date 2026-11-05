import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type UIEvent } from "react";
import { isKey } from "@/lib/keys";
import { useChatHotkey } from "@/features/chat/pane/chatHotkeys";
import { jumpToEvent } from "./jumpToEvent";
import type { TimelineScroll } from "./timelineScroll";
import type { TimelineWindow } from "./useTimelineWindow";

/**
 * 窓の外の項目を足し始める、端からの距離（画面の高さに対する割合と、最低限の px）。
 * 端に着いてから足すと、トラックパッドの慣性が端で止まり「途中で止まる」ように見えるので、ずっと手前で足しておく
 */
const LOAD_AHEAD_VIEWPORTS = 1.5;
const LOAD_AHEAD_MIN_PX = 600;

/** 一番下を見ているとみなす、下端からの距離（これより上にスクロールしたら、新しい発言に付いていかない。既読にするかもこれで見る） */
export const BOTTOM_SLACK_PX = 80;

/**
 * 流れのスクロール（ChatTimeline）:
 * - 一番下を見ているときだけ、新しい発言・確認のカード・書いている途中の返答・流れの終わりの様子（作業中の行が出た・圧縮中の行に替わった）に合わせて下へ
 *   （窓は数が変わらないまま進むので、最後の項目で見分ける）
 * - 上の端に近づいたら（着く前に）前の項目を足し、読んでいた位置を動かさない。下の端に近づいたら後ろの項目を足す（途中の一部分を描いているとき）
 * - 一番下へ戻る（途中の一部分を描いているときは、最新の窓に戻して描いてから）。⌘↓ でも（このチャットにピントがあり、上を読んでいるとき）
 * - 検索結果から開いた発言（focus）へ移って一瞬強調する
 * away は一番下から離れているか（一番下へ戻るボタンを出す）
 */
export function useTimelineScroll({
  scroll,
  root,
  window: w,
  focus,
  approvalsCount,
  streaming,
  endKey,
}: {
  scroll: TimelineScroll;
  /** チャットの画面の要素（⌘↓ をこのチャットで受け取るか） */
  root: RefObject<HTMLElement | null>;
  window: TimelineWindow;
  focus?: number;
  approvalsCount: number;
  streaming: string;
  /**
   * 流れの終わりの様子（作業中の行を出しているか・圧縮中の行か）。項目が増えなくても終わりの高さが変わるので、変わったら付いていく
   * （手で圧縮を始めたときの作業中の行・作業の途中で圧縮中の行に替わったときに、下が切れたままになっていた）
   */
  endKey: string;
}) {
  const [away, setAway] = useState(false);
  const { hidden, hiddenAfter: after } = w;
  // 窓の最初と最後の項目（前を足した・新しい発言が届いたを見分ける）
  const firstKey = w.visible[0]?.key;
  const lastKey = w.visible.at(-1)?.key;

  // 検索結果から開いたときは、その発言までスクロールして一瞬強調する
  useEffect(() => {
    const el = scroll.ref.current;
    if (!focus || !el || !jumpToEvent(el, focus)) return;
    scroll.release();
  }, [focus, lastKey, scroll]);

  // 前の項目を足したら、読んでいた位置を動かさない（上に足した分だけ下げる）
  const beforeMore = useRef<{ height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = scroll.ref.current;
    const prev = beforeMore.current;
    if (!el || !prev) return;
    beforeMore.current = null;
    // ふつうはブラウザのスクロールアンカーがもう位置を合わせている。合っていないときだけ直す
    // （書き換えると、トラックパッドの慣性のスクロールがそこで止まる）
    const expected = prev.top + (el.scrollHeight - prev.height);
    if (Math.abs(el.scrollTop - expected) > 1) el.scrollTop = expected;
  }, [firstKey, scroll]);
  const showMore = () => {
    const el = scroll.ref.current;
    if (!el || beforeMore.current) return;
    beforeMore.current = { height: el.scrollHeight, top: el.scrollTop };
    w.showMore();
  };

  // 一番下を見ているときだけ、新しい発言に合わせてスクロールする
  useEffect(() => {
    const el = scroll.ref.current;
    if (el && scroll.following() && !focus) el.scrollTop = el.scrollHeight;
    // 窓（最近の項目だけ描く）は数が変わらないまま進むので、最後の項目で新しい発言を見分ける
  }, [lastKey, approvalsCount, streaming, endKey, focus, scroll]);

  // 途中の一部分を描いているときに一番下へ戻る: 最新の窓に戻して、描いてから一番下へ
  const toLatest = useRef(false);
  useLayoutEffect(() => {
    const el = scroll.ref.current;
    if (!el || !toLatest.current || after > 0) return;
    toLatest.current = false;
    el.scrollTop = el.scrollHeight;
  }, [lastKey, after, scroll]);
  const scrollToBottom = () => {
    const el = scroll.ref.current;
    if (!el) return;
    scroll.follow();
    if (after > 0) {
      toLatest.current = true;
      w.latest();
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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

  const onScroll = (e: UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // 途中の一部分を描いているときは、下の端まで来ても最新ではない
    const atBottom = after === 0 && fromBottom < BOTTOM_SLACK_PX;
    if (atBottom) scroll.follow();
    else scroll.release();
    setAway(!atBottom);
    if (atBottom) w.atBottom();
    // 上の端に近づいたら（着く前に）、窓の外の前の項目を足す
    const ahead = Math.max(LOAD_AHEAD_MIN_PX, el.clientHeight * LOAD_AHEAD_VIEWPORTS);
    // （一番下にいるときは足さない。窓が短いと、一番下で窓を戻す処理と行き来するため）
    if (hidden > 0 && !atBottom && el.scrollTop < ahead) showMore();
    // 下の端に近づいたら、窓の外の後ろの項目を足す（下に足すので、読んでいた位置は動かない）
    if (after > 0 && fromBottom < ahead) w.showLater();
  };

  return { away, firstKey, lastKey, onScroll, showMore, scrollToBottom };
}
