import { useEffect, useRef, useState, type RefObject } from "react";
import { cx } from "../../cx";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { adjacentPrompt, currentPrompt, promptTops } from "./promptNav";
import type { PromptEntry } from "./promptHistory";

/**
 * チャットの目次: 流れの右端に、自分の指示を 1 つずつ目盛りで並べる（いま読んでいるところの指示を濃く）。
 * 乗せると指示の初めの行の一覧に広がり、押すとその指示へ移る。⌘⌥↑ / ↓ で前後の指示へ（このチャットにピントがあるとき）
 */
export function PromptRail({ root, prompts, onJump }: { root: RefObject<HTMLElement | null>; prompts: PromptEntry[]; onJump: (eventId: number) => void }) {
  const [current, setCurrent] = useState<number>();
  // 前に移った先（まだ画面に見えていれば、次の ⌘⌥↑ / ↓ はその前後へ。いちばん下で上端まで送れない指示でも先へ進める）
  const lastJump = useRef<number>(undefined);
  const ids = prompts.map((p) => p.id);
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const timelineOf = () => root.current?.querySelector<HTMLElement>(".timeline") ?? null;
  /** 前に移った先が、まだ画面に見えているならその ID */
  const anchorOf = (timeline: HTMLElement, tops: Map<number, number>) => {
    const top = lastJump.current === undefined ? undefined : tops.get(lastJump.current);
    return top !== undefined && top > -timeline.clientHeight / 2 && top < timeline.clientHeight ? lastJump.current : undefined;
  };
  const jump = (id: number) => {
    lastJump.current = id;
    setCurrent(id);
    onJump(id);
  };

  // スクロールに合わせて、いま読んでいるところの指示を決める（画面の真ん中より上から始まる指示。一番下では見えている最後の指示）
  useEffect(() => {
    const timeline = timelineOf();
    if (!timeline) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const tops = promptTops(timeline);
      const atBottom = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 4;
      setCurrent(anchorOf(timeline, tops) ?? currentPrompt(idsRef.current, tops, atBottom ? timeline.clientHeight - 24 : timeline.clientHeight / 2));
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(update);
    };
    update();
    timeline.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      timeline.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
    // 指示が増えた・窓が動いたら測り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  // ⌘⌥↑ / ↓: 前後の指示へ（このチャットにピントがあるとき。縦スライドのプロジェクトの切り替えより先に受け取る）
  useWindowEvent(
    "keydown",
    (e) => {
      if (!e.metaKey || !e.altKey || e.ctrlKey || e.shiftKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      const timeline = timelineOf();
      if (!timeline || !root.current?.contains(document.activeElement)) return;
      e.preventDefault();
      const tops = promptTops(timeline);
      const next = adjacentPrompt(idsRef.current, tops, e.key === "ArrowUp" ? -1 : 1, anchorOf(timeline, tops));
      if (next !== undefined) jump(next);
    },
    true,
    true,
  );

  if (prompts.length < 2) return null;
  return (
    <nav
      className="prompt-rail"
      aria-label="指示の目次（⌘⌥↑ / ↓ で前後の指示へ）"
      // 一覧に広がったら、いま読んでいるところの指示を見せる
      onMouseEnter={(e) => e.currentTarget.querySelector(".prompt-rail-item.current")?.scrollIntoView({ block: "nearest" })}
    >
      <div className="prompt-rail-list">
        {prompts.map((p, i) => (
          <button key={p.id} type="button" className={cx("prompt-rail-item", p.id === current && "current")} aria-current={p.id === current || undefined} onClick={() => jump(p.id)}>
            <span className="prompt-rail-label">
              <span className="prompt-index">{i + 1}</span>
              <span className="prompt-text">{p.label}</span>
            </span>
            <span className="prompt-rail-tick" aria-hidden />
          </button>
        ))}
      </div>
    </nav>
  );
}
