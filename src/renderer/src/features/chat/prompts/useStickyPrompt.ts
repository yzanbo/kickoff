import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Attachment } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import { STICKY_PROMPT_HIDDEN } from "@/lib/storageKeys";
import type { PromptList } from "./promptHistory";
import { promptAround } from "./promptNav";
import { readingLine, readingPrompt, samePinned, type PinnedHold, type PinnedPrompt } from "./StickyPrompt";

const NO_ATTACHMENTS: Attachment[] = [];

/**
 * 上に貼り付けておく自分の発言（読んでいる返答の元の発言。いつも出しておき、スクロールに合わせて中身を変える。
 * 見出しの行のボタン・設定の「表示」で出さないこともできる）。
 * 描いた項目（窓の最初と最後）・帯の出し方が変わったら確かめ直す（スクロールしなくても、開いたときから帯を出す）。スクロールしたら update を呼ぶ。
 * 同じ発言のままなら前の値を残し、スクロールのたびに描き直さない。
 * 出している指示は、選んだときの線を覚えて、そこより下へ戻るまで出し続ける（`PinnedHold`。前は、高さの違う指示の境目で、
 * 帯が替わると流れの上端が動いてまた元の指示に戻り、一番下に付いていく間は帯が毎フレーム替わり続けた）。
 * 帯の高さが変わったときに流れのスクロールを合わせて中身を止めることはしない（止めると、上へ戻って高い帯に替わったときに次の吹き出しが帯の下に回り込み、また替わった。
 * 動かさなければ、中身は境目から離れる向きに動く）
 */
export function useStickyPrompt(timeline: RefObject<HTMLElement | null>, prompts: PromptList, firstKey: string | undefined, lastKey: string | undefined) {
  const [hidden] = useSetting(STICKY_PROMPT_HIDDEN);
  const [pinned, setPinned] = useState<PinnedPrompt>();
  const current = useRef<PinnedPrompt>(undefined);
  const hold = useRef<PinnedHold>(undefined);
  const update = () => {
    const el = timeline.current;
    const next = !el || hidden ? undefined : readingPrompt(el, prompts, hold.current);
    if (samePinned(current.current, next)) return;
    current.current = next;
    hold.current = el && next ? { id: next.id, line: readingLine(el) } : undefined;
    setPinned(next);
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
