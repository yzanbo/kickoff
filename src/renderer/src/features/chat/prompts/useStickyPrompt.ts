import { useLayoutEffect, useState, type RefObject } from "react";
import type { Attachment } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import { STICKY_PROMPT_HIDDEN } from "@/lib/storageKeys";
import type { PromptList } from "./promptHistory";
import { promptAround } from "./promptNav";
import { readingPrompt, samePinned, type PinnedPrompt } from "./StickyPrompt";

const NO_ATTACHMENTS: Attachment[] = [];

/**
 * 上に貼り付けておく自分の発言（読んでいる返答の元の発言。いつも出しておき、スクロールに合わせて中身を変える。
 * 見出しの行のボタン・設定の「表示」で出さないこともできる）。
 * 描いた項目（窓の最初と最後）・帯の出し方が変わったら確かめ直す（スクロールしなくても、開いたときから帯を出す）。スクロールしたら update を呼ぶ。
 * 同じ発言のままなら前の値を残し、スクロールのたびに描き直さない
 */
export function useStickyPrompt(timeline: RefObject<HTMLElement | null>, prompts: PromptList, firstKey: string | undefined, lastKey: string | undefined) {
  const [hidden] = useSetting(STICKY_PROMPT_HIDDEN);
  const [pinned, setPinned] = useState<PinnedPrompt>();
  const update = () => {
    const el = timeline.current;
    const next = !el || hidden ? undefined : readingPrompt(el);
    setPinned((prev) => (samePinned(prev, next) ? prev : next));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(update, [firstKey, lastKey, hidden]);
  // 帯の ↑ / ↓ を押せるか（貼り付けたのが質問への回答なら、その前後に指示があるか）と、貼り付けた指示の添付
  return {
    /** 帯に出す指示（出さない・まだ流れていないときは undefined） */
    pinned: hidden ? undefined : pinned,
    attachments: (pinned && prompts.byId.get(pinned.id)?.attachments) || NO_ATTACHMENTS,
    hasPrev: pinned !== undefined && promptAround(prompts.ids, pinned.id, -1) !== undefined,
    hasNext: pinned !== undefined && promptAround(prompts.ids, pinned.id, 1) !== undefined,
    update,
  };
}
