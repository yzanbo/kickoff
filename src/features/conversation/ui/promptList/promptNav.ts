// 自分の指示（発言）のあいだを移る（⌘⌥↑ / ↓）ための判定（位置は窓から読み、決めるのは純粋関数）

/** 上下の遊び（px）。吹き出しの上端がちょうど流れの上端にあるときに、前後を取り違えないように */
const SLACK = 8;

/**
 * 自分の指示の上端の、流れの見えている上端からの距離（px）。位置は窓（描いていない行も前からの和で）から locate で読み、
 * 窓の中にない指示は読み込んだ範囲（loaded）の前なら上（-∞）、後ろなら下（+∞）とみなす（読み込んでいない範囲の指示は記録の順で前後を決める）。
 * 描いていない指示を「上にある」とみなすと、箱の窓で下の箱に入った指示へ ⌘⌥↑ で跳ぶため、位置はいつも数で持つ
 */
export function promptTops(ids: number[], locate: (id: number) => number | undefined, loaded: { first: number; last: number } | null): Map<number, number> {
  const tops = new Map<number, number>();
  for (const id of ids) {
    const top = locate(id);
    if (top !== undefined) tops.set(id, top);
    else if (loaded) tops.set(id, id < loaded.first ? -Infinity : Infinity);
  }
  return tops;
}

/**
 * 前（dir = -1）・次（dir = 1）の指示（なければ undefined）。
 * anchor（前に移った先で、まだ画面に見えているもの）があれば、その前後。なければ位置で決める:
 * 前へは、流れの上端より上から始まるもののうちいちばん下（読んでいる返答の元の指示）、次へは、上端より下から始まるもののうちいちばん上。
 * 位置の分からない指示（tops にない）は選ばない
 */
export function adjacentPrompt(ids: number[], tops: Map<number, number>, dir: -1 | 1, anchor?: number): number | undefined {
  const at = anchor === undefined ? -1 : ids.indexOf(anchor);
  if (at >= 0) return ids[at + dir];
  if (dir < 0) {
    for (let i = ids.length - 1; i >= 0; i--) {
      const top = tops.get(ids[i]);
      if (top !== undefined && top < -SLACK) return ids[i];
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
