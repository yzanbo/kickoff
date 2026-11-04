import { useRef, type RefObject } from "react";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { adjacentPrompt, promptTops } from "./promptNav";
import type { PromptEntry } from "./promptHistory";

/**
 * 前後の自分の指示へ移る: ⌘⌥↑ / ↓（このチャットにピントがあるときだけ。縦スライドのプロジェクトの切り替えより先に受け取る）と、
 * 上に貼り付けた指示の帯の ↑ / ↓（`go` を返す）。前に移った先がまだ画面に見えていれば、その前後へ（いちばん下で上端まで送れない指示でも先へ進める）。
 * なければ、帯からは貼り付けた指示の前後へ、キーからは位置で決める
 */
export function usePromptKeys(root: RefObject<HTMLElement | null>, prompts: PromptEntry[], onJump: (eventId: number) => void) {
  const lastJump = useRef<number>(undefined);
  const idsRef = useRef<number[]>([]);
  idsRef.current = prompts.map((p) => p.id);
  /** dir の向きの指示へ移る（from: 貼り付けた指示。その前後へ移る。省けば位置で決める） */
  const go = (dir: -1 | 1, from?: number) => {
    const timeline = root.current?.querySelector<HTMLElement>(".timeline");
    if (!timeline) return;
    const tops = promptTops(timeline);
    const ids = idsRef.current;
    // 前に移った先が、まだ画面に見えているならその前後へ
    const top = lastJump.current === undefined ? undefined : tops.get(lastJump.current);
    const anchor = top !== undefined && top > -timeline.clientHeight / 2 && top < timeline.clientHeight ? lastJump.current : undefined;
    const next = anchor === undefined && from !== undefined ? ids[ids.indexOf(from) + dir] : adjacentPrompt(ids, tops, dir, anchor);
    if (next === undefined) return;
    lastJump.current = next;
    onJump(next);
  };
  useWindowEvent(
    "keydown",
    (e) => {
      if (!e.metaKey || !e.altKey || e.ctrlKey || e.shiftKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      if (!root.current?.querySelector(".timeline") || !root.current.contains(document.activeElement)) return;
      e.preventDefault();
      go(e.key === "ArrowUp" ? -1 : 1);
    },
    true,
    true,
  );
  return { go };
}
