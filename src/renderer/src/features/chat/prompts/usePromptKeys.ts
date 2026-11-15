import { useRef, type RefObject } from "react";
import { isKey } from "@/lib/keys";
import { useChatHotkey } from "@/features/chat/pane/chatHotkeys";
import { adjacentPrompt, promptAround, promptTops } from "./promptNav";

/** 中の吹き出しの位置を読む、流れの上端からの距離（行の上端の余白より広く） */
const NEAR_PX = 40;

/**
 * 前後の自分の指示へ移る: ⌘⌥↑ / ↓（このチャットにピントがあるときだけ。縦スライドのプロジェクトの切り替えより先に受け取る）と、
 * 上に貼り付けた指示の帯の ↑ / ↓（`go` を返す）。前に移った先がまだ画面に見えていれば、その前後へ（いちばん下で上端まで送れない指示でも先へ進める）。
 * なければ、帯からは貼り付けた指示（質問への回答なら、その前後の指示）の前後へ、キーからは位置で決める。
 * 位置は流れの窓から読む（locate。描いていない行も前からの和で）。流れの上端の近くの行と前に移った先だけ、中の吹き出しの位置を読む
 * （行の包みの上端と吹き出しの上端は余白の分だけ違い、上端の遊びとの上下が変わりうるため。ほかの行は行の上端で同じ答えになる）
 */
export function usePromptKeys({
  root,
  timeline,
  promptIds,
  locate,
  loaded,
  onJump,
}: {
  root: RefObject<HTMLElement | null>;
  timeline: RefObject<HTMLElement | null>;
  promptIds: number[];
  /** 指示の行の上端の、流れの見えている上端からの距離（流れに出していない指示は undefined） */
  locate: (id: number) => number | undefined;
  /** 流れに出している記録の範囲（記録の ID。出していなければ null） */
  loaded: { first: number; last: number } | null;
  onJump: (eventId: number) => void;
}) {
  const lastJump = useRef<number>(undefined);
  const now = useRef({ ids: promptIds, locate, loaded });
  now.current = { ids: promptIds, locate, loaded };
  /** dir の向きの指示へ移る（from: 貼り付けた指示か質問への回答。その前後へ移る。省けば位置で決める） */
  const go = (dir: -1 | 1, from?: number) => {
    const el = timeline.current;
    if (!el) return;
    const { ids, locate, loaded } = now.current;
    const top0 = el.getBoundingClientRect().top;
    const exact = (id: number): number | undefined => {
      const top = locate(id);
      if (top === undefined || (Math.abs(top) > NEAR_PX && id !== lastJump.current)) return top;
      const bubble = el.querySelector<HTMLElement>(`#ev-${id}`);
      return bubble ? bubble.getBoundingClientRect().top - top0 : top;
    };
    const tops = promptTops(ids, exact, loaded);
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
