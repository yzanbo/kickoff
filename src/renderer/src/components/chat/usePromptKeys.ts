import { useRef, type RefObject } from "react";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { adjacentPrompt, promptTops } from "./promptNav";
import type { PromptEntry } from "./promptHistory";

/**
 * ⌘⌥↑ / ↓: 前後の自分の指示へ移る（このチャットにピントがあるときだけ。縦スライドのプロジェクトの切り替えより先に受け取る）。
 * 前に移った先がまだ画面に見えていれば、その前後へ（いちばん下で上端まで送れない指示でも先へ進める）。なければ位置で決める
 */
export function usePromptKeys(root: RefObject<HTMLElement | null>, prompts: PromptEntry[], onJump: (eventId: number) => void) {
  const lastJump = useRef<number>(undefined);
  const idsRef = useRef<number[]>([]);
  idsRef.current = prompts.map((p) => p.id);
  useWindowEvent(
    "keydown",
    (e) => {
      if (!e.metaKey || !e.altKey || e.ctrlKey || e.shiftKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      const timeline = root.current?.querySelector<HTMLElement>(".timeline");
      if (!timeline || !root.current?.contains(document.activeElement)) return;
      e.preventDefault();
      const tops = promptTops(timeline);
      // 前に移った先が、まだ画面に見えているならその前後へ
      const top = lastJump.current === undefined ? undefined : tops.get(lastJump.current);
      const anchor = top !== undefined && top > -timeline.clientHeight / 2 && top < timeline.clientHeight ? lastJump.current : undefined;
      const next = adjacentPrompt(idsRef.current, tops, e.key === "ArrowUp" ? -1 : 1, anchor);
      if (next === undefined) return;
      lastJump.current = next;
      onJump(next);
    },
    true,
    true,
  );
}
