import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { cx } from "../../cx";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { adjacentPrompt, currentPrompt, promptTops, railWindow } from "./promptNav";
import type { PromptEntry } from "./promptHistory";

/**
 * チャットの目次: 流れの右端に、自分の指示を 1 つずつ目盛りで並べる（いま読んでいるところの指示を濃く）。
 * 乗せると指示の初めの行の一覧に広がり、押すとその指示へ移る。⌘⌥↑ / ↓ で前後の指示へ（このチャットにピントがあるとき）。
 * 目盛りは流れの高さ（の 6 割）に収まるだけ出す（railWindow。PC ごとの画面の高さ・欄の高さに合わせ、変わったら測り直す）。
 * 収まらないときは、いま読んでいる指示を真ん中に前後を出し、上下に隠れた数（「↑ 140」）を添える（押すと隠れた側のすぐ隣の指示へ）。
 * 乗せて広げた一覧は中でスクロールできるので、間引かずにすべての指示を出し、いま読んでいる指示を真ん中に見せる
 */
export function PromptRail({ root, prompts, onJump }: { root: RefObject<HTMLElement | null>; prompts: PromptEntry[]; onJump: (eventId: number) => void }) {
  const [current, setCurrent] = useState<number>();
  // 前に移った先（まだ画面に見えていれば、次の ⌘⌥↑ / ↓ はその前後へ。いちばん下で上端まで送れない指示でも先へ進める）
  const lastJump = useRef<number>(undefined);
  const ids = prompts.map((p) => p.id);
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const timelineOf = () => root.current?.querySelector<HTMLElement>(".timeline") ?? null;
  // 目盛りを並べられる高さ（流れの高さの 6 割。.prompt-rail の max-height と同じ）。流れの大きさが変わったら測り直す
  const [railHeight, setRailHeight] = useState(0);
  useEffect(() => {
    const timeline = timelineOf();
    if (!timeline) return;
    // 一覧の枠線（上下 1px）の分を引く
    const measure = () => setRailHeight(Math.floor(timeline.clientHeight * 0.6) - 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(timeline);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts.length >= 2]);
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

  // 一覧に広げているか（乗せた・キーでピントが入った）。広げている間はすべての指示を出す
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  // 広げたら、いま読んでいるところの指示を一覧の真ん中に見せる（すべて出すので、遠くの指示でも見える位置まで動かす）
  useLayoutEffect(() => {
    if (!open) return;
    const list = navRef.current?.querySelector<HTMLElement>(".prompt-rail-list");
    const item = list?.querySelector<HTMLElement>(".prompt-rail-item.current");
    if (!list || !item) return;
    const offset = item.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    list.scrollTop = offset - (list.clientHeight - item.offsetHeight) / 2;
  }, [open]);

  if (prompts.length < 2) return null;
  const { start, end } = open ? { start: 0, end: prompts.length } : railWindow(prompts.length, prompts.findIndex((p) => p.id === current), railHeight);
  const shown = prompts.slice(start, end);
  const hiddenAfter = prompts.length - end;
  return (
    <nav
      ref={navRef}
      className="prompt-rail"
      aria-label="指示の目次（⌘⌥↑ / ↓ で前後の指示へ）"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={(e) => !e.currentTarget.contains(document.activeElement) && setOpen(false)}
      onFocus={(e) => e.target.matches(":focus-visible") && setOpen(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && !e.currentTarget.matches(":hover") && setOpen(false)}
    >
      <div className="prompt-rail-list">
        {start > 0 && (
          <button type="button" className="prompt-rail-more" title={`前の指示 ${start} 件（押すとすぐ上の指示へ）`} onClick={() => jump(prompts[start - 1].id)}>
            ↑ {start}
          </button>
        )}
        {shown.map((p, i) => (
          <button key={p.id} type="button" className={cx("prompt-rail-item", p.id === current && "current")} aria-current={p.id === current || undefined} onClick={() => jump(p.id)}>
            <span className="prompt-rail-label">
              <span className="prompt-index">{start + i + 1}</span>
              <span className="prompt-text">{p.label}</span>
            </span>
            <span className="prompt-rail-tick" aria-hidden />
          </button>
        ))}
        {hiddenAfter > 0 && (
          <button type="button" className="prompt-rail-more" title={`後の指示 ${hiddenAfter} 件（押すとすぐ下の指示へ）`} onClick={() => jump(prompts[end].id)}>
            ↓ {hiddenAfter}
          </button>
        )}
      </div>
    </nav>
  );
}
