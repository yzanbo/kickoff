// 自分の指示（発言）のあいだを移る（⌘⌥↑ / ↓）ための判定（位置は画面から測り、決めるのは純粋関数）

/** 上下の遊び（px）。吹き出しの上端がちょうど流れの上端にあるときに、前後を取り違えないように */
const SLACK = 8;

/**
 * 流れの中の自分の発言の上端の位置（流れの上端からの px。描いていないもの（窓の外の前の発言）は入れない）
 */
export function promptTops(timeline: HTMLElement): Map<number, number> {
  const top = timeline.getBoundingClientRect().top;
  const tops = new Map<number, number>();
  for (const bubble of timeline.querySelectorAll<HTMLElement>(".bubble.user[id^='ev-']")) {
    const id = Number(bubble.id.slice(3));
    if (Number.isFinite(id)) tops.set(id, bubble.getBoundingClientRect().top - top);
  }
  return tops;
}

/**
 * 前（dir = -1）・次（dir = 1）の指示（なければ undefined）。
 * anchor（前に移った先で、まだ画面に見えているもの）があれば、その前後。なければ位置で決める:
 * 前は、流れの上端より上から始まるもの（描いていない前の発言も上にあるとみなす）のうちいちばん下（読んでいる返答の元の指示）、
 * 次は、上端より下から始まるもののうちいちばん上
 */
export function adjacentPrompt(ids: number[], tops: Map<number, number>, dir: -1 | 1, anchor?: number): number | undefined {
  const at = anchor === undefined ? -1 : ids.indexOf(anchor);
  if (at >= 0) return ids[at + dir];
  if (dir < 0) {
    for (let i = ids.length - 1; i >= 0; i--) {
      const top = tops.get(ids[i]);
      if (top === undefined || top < -SLACK) return ids[i];
    }
    return undefined;
  }
  return ids.find((id) => {
    const top = tops.get(id);
    return top !== undefined && top > SLACK;
  });
}
