import { useState, type RefObject } from "react";

/**
 * 流れのスクロールの持ち主（ChatView がチャットごとに 1 つ作り、流れ・窓・チャットの画面の操作で共有する。描き直しても同じもの）。
 * ref は流れの要素（スクロールする枠）。following は一番下に付いていくか（送った・一番下へ戻ったら付き、上へスクロールした・発言へ移ったら離れる）。
 * held は利用者が上へ戻している途中か（スクロールの知らせより先に付いていきをやめ、そのスクロールが終わるまでは一番下の近くでも付き直さない。
 * 書いている途中は中身が毎フレーム伸びて寄せるので、上へ戻し始めた 1〜2 フレームが一番下へ引き戻されていた）。
 * 以前は ChatPane の ref（stickToBottom）を、2 つの部品から 9 か所で書き換えていた
 */
export interface TimelineScroll {
  readonly ref: RefObject<HTMLDivElement | null>;
  /** 流れの行の並び（.timeline-inner。窓が gap・本文の幅・文字の倍率を測る） */
  readonly inner: RefObject<HTMLDivElement | null>;
  following: () => boolean;
  /** 一番下に付いていく（送った・一番下へ戻った）。上へ戻している途中の印も外す */
  follow: () => void;
  /** 一番下に付いていかない（上を読んでいる・発言へ移った・検索で移った） */
  release: () => void;
  /** 利用者が上へ戻す操作を始めた（ホイール・キー・スクロールバー）。付いていきをやめ、終わるまで付き直さない */
  holdUp: () => void;
  /** 上へ戻している途中か */
  held: () => boolean;
  /** スクロールし終えた（上へ戻している途中の印を外す） */
  settle: () => void;
}

/** initialFollow: 初めに一番下に付いていくか（検索結果から開いたときは付いていかない） */
export function useTimelineScrollHandle(initialFollow: boolean): TimelineScroll {
  const [scroll] = useState<TimelineScroll>(() => {
    let following = initialFollow;
    let held = false;
    return {
      ref: { current: null },
      inner: { current: null },
      following: () => following,
      follow: () => {
        following = true;
        held = false;
      },
      release: () => {
        following = false;
      },
      holdUp: () => {
        following = false;
        held = true;
      },
      held: () => held,
      settle: () => {
        held = false;
      },
    };
  });
  return scroll;
}
