import { useRef, type RefObject } from "react";
import { isKey } from "@/lib/keys";
import { useChatHotkey } from "@/features/chat/pane/chatHotkeys";
import { adjacentPrompt, promptAround, promptTops } from "./promptNav";

/**
 * 前後の自分の指示へ移る: ⌘⌥↑ / ↓（このチャットにピントがあるときだけ。縦スライドのプロジェクトの切り替えより先に受け取る）と、
 * 上に貼り付けた指示の帯の ↑ / ↓（`go` を返す）。前に移った先がまだ画面に見えていれば、その前後へ（いちばん下で上端まで送れない指示でも先へ進める）。
 * なければ、帯からは貼り付けた指示（質問への回答なら、その前後の指示）の前後へ、キーからは位置で決める。timeline は流れの要素（指示の位置を測る）
 */
export function usePromptKeys({
  root,
  timeline,
  promptIds,
  onJump,
}: {
  root: RefObject<HTMLElement | null>;
  timeline: RefObject<HTMLElement | null>;
  promptIds: number[];
  onJump: (eventId: number) => void;
}) {
  const lastJump = useRef<number>(undefined);
  const idsRef = useRef<number[]>([]);
  idsRef.current = promptIds;
  /** dir の向きの指示へ移る（from: 貼り付けた指示か質問への回答。その前後へ移る。省けば位置で決める） */
  const go = (dir: -1 | 1, from?: number) => {
    const el = timeline.current;
    if (!el) return;
    const tops = promptTops(el);
    const ids = idsRef.current;
    // 前に移った先が、まだ画面に見えているならその前後へ
    const top = lastJump.current === undefined ? undefined : tops.get(lastJump.current);
    const anchor = top !== undefined && top > -el.clientHeight / 2 && top < el.clientHeight ? lastJump.current : undefined;
    const next = anchor === undefined && from !== undefined ? promptAround(ids, from, dir) : adjacentPrompt(ids, tops, dir, anchor);
    if (next === undefined) return;
    lastJump.current = next;
    onJump(next);
  };
  useChatHotkey(
    root,
    (e) => isKey(e, "ArrowUp", { meta: true, alt: true }) || isKey(e, "ArrowDown", { meta: true, alt: true }),
    (e) => {
      if (!timeline.current) return;
      e.preventDefault();
      go(e.key === "ArrowUp" ? -1 : 1);
    },
    { capture: true },
  );
  return { go };
}
