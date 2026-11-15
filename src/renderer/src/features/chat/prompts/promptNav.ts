// 自分の指示（発言）のあいだを移る（⌘⌥↑ / ↓）ための判定（位置は画面から測り、決めるのは純粋関数）

/** 上下の遊び（px）。吹き出しの上端がちょうど流れの上端にあるときに、前後を取り違えないように */
const SLACK = 8;

/**
 * 流れの中の自分の発言の上端の位置（流れの上端からの px。描いていないもの（窓の外の前の発言）は入れない）。
 * 位置は行の包み（data-prompt-id）で読み、流れの上端の遊びに掛かる行と exact の指示（前に移った先）だけ、中の吹き出しの位置を読む
 * （画面の外の行は描くのを省いているので、中の要素の位置を読むとその行のレイアウトを強いる。前後の決め方は上端の遊びとの上下だけなので、
 * 遊びに掛からない行は行の上端で同じ答えになる）
 */
export function promptTops(timeline: HTMLElement, exact?: number): Map<number, number> {
  const top = timeline.getBoundingClientRect().top;
  const tops = new Map<number, number>();
  for (const row of timeline.querySelectorAll<HTMLElement>(":scope > .timeline-inner > .timeline-row[data-prompt-id]")) {
    const id = Number(row.dataset.promptId);
    if (!Number.isFinite(id)) continue;
    const box = row.getBoundingClientRect();
    const near = box.top - top <= SLACK && box.bottom - top >= -SLACK;
    const bubble = near || id === exact ? row.querySelector<HTMLElement>(".bubble.user") : null;
    tops.set(id, (bubble ? bubble.getBoundingClientRect().top : box.top) - top);
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

/**
 * from の前（dir = -1）・次（dir = 1）の指示（なければ undefined）。from が指示でない吹き出し（質問への回答）なら、
 * 記録の順でその前・後ろにあるいちばん近い指示（ids は記録の順 = ID の昇順）
 */
export function promptAround(ids: number[], from: number, dir: -1 | 1): number | undefined {
  const at = ids.indexOf(from);
  if (at >= 0) return ids[at + dir];
  return dir < 0 ? ids.findLast((id) => id < from) : ids.find((id) => id > from);
}
