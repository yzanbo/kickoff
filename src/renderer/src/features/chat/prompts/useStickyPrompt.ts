import { useLayoutEffect, useState, type RefObject } from "react";
import type { Attachment } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import { STICKY_PROMPT_HIDDEN } from "@/lib/storageKeys";
import type { PromptList } from "./promptHistory";
import { readingPrompt } from "./StickyPrompt";

const NO_ATTACHMENTS: Attachment[] = [];

/**
 * 上に貼り付けておく自分の発言（読んでいる返答の元の発言。いつも出しておき、スクロールに合わせて中身を変える。
 * 見出しの行のボタン・設定の「表示」で出さないこともできる）。
 * 描いた項目（窓の最初と最後）・帯の出し方が変わったら確かめ直す（スクロールしなくても、開いたときから帯を出す）。スクロールしたら update を呼ぶ。
 * 同じ発言のままなら前の値を残し、スクロールのたびに描き直さない
 */
export function useStickyPrompt(timeline: RefObject<HTMLElement | null>, prompts: PromptList, firstKey: string | undefined, lastKey: string | undefined) {
  const [hidden] = useSetting(STICKY_PROMPT_HIDDEN);
  const [pinned, setPinned] = useState<{ id: number; text: string }>();
  const update = () => {
    const el = timeline.current;
    const next = !el || hidden ? undefined : readingPrompt(el);
    setPinned((prev) => (prev?.id === next?.id && prev?.text === next?.text ? prev : next));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(update, [firstKey, lastKey, hidden]);
  // 自分の指示の並びの中の位置（帯の ↑ / ↓ を押せるか）と、貼り付けた指示の添付
  const at = pinned ? prompts.ids.indexOf(pinned.id) : -1;
  return {
    /** 帯に出す指示（出さない・まだ流れていないときは undefined） */
    pinned: hidden ? undefined : pinned,
    attachments: (pinned && prompts.byId.get(pinned.id)?.attachments) || NO_ATTACHMENTS,
    hasPrev: at > 0,
    hasNext: at >= 0 && at < prompts.ids.length - 1,
    update,
  };
}
