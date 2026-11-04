import { useState, type RefObject } from "react";

/**
 * 流れのスクロールの持ち主（ChatView がチャットごとに 1 つ作り、流れ・窓・チャットの画面の操作で共有する。描き直しても同じもの）。
 * ref は流れの要素（スクロールする枠）。following は一番下に付いていくか（送った・一番下へ戻ったら付き、上へスクロールした・発言へ移ったら離れる）。
 * 以前は ChatPane の ref（stickToBottom）を、2 つの部品から 9 か所で書き換えていた
 */
export interface TimelineScroll {
  readonly ref: RefObject<HTMLDivElement | null>;
  following: () => boolean;
  /** 一番下に付いていく（送った・一番下へ戻った） */
  follow: () => void;
  /** 一番下に付いていかない（上を読んでいる・発言へ移った・検索で移った） */
  release: () => void;
}

export function useTimelineScrollHandle(): TimelineScroll {
  const [scroll] = useState<TimelineScroll>(() => {
    let following = true;
    return {
      ref: { current: null },
      following: () => following,
      follow: () => {
        following = true;
      },
      release: () => {
        following = false;
      },
    };
  });
  return scroll;
}
