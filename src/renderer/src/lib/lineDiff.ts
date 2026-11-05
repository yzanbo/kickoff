// 2 つの文を行ごとに比べる（最長共通部分列。純粋関数）。メモの AI の案の差分・ターンの変更カードの行の数で共通に使う

/** 比べた 1 行（same = 両方にある / del = 前だけ / add = 後ろだけ） */
export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
}

/** 行に分ける（空の文は 0 行。最後の改行は行に数えない） */
const lines = (text: string) => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));

/** 行ごとの比べ合わせの上限（これより大きいときは、前後の同じ行を除いた残りを「すべて消して・すべて足した」とする） */
const MAX_CELLS = 1_000_000;

/** 前後の文の行ごとの違い（前と後ろの同じ行を先に外してから、残りを最長共通部分列で比べる。消した行を足した行より先に並べる） */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = lines(before);
  const b = lines(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const same = (text: string): DiffLine => ({ kind: "same", text });
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const out: DiffLine[] = a.slice(0, head).map(same);
  if (midA.length * midB.length > MAX_CELLS) {
    out.push(...midA.map((text): DiffLine => ({ kind: "del", text })), ...midB.map((text): DiffLine => ({ kind: "add", text })));
  } else {
    // 表 len[i][j] = midA[i..] と midB[j..] の最長共通部分列の長さ（後ろから埋め、前からたどる）
    const w = midB.length + 1;
    const len = new Uint32Array((midA.length + 1) * w);
    for (let i = midA.length - 1; i >= 0; i--) {
      for (let j = midB.length - 1; j >= 0; j--) {
        len[i * w + j] = midA[i] === midB[j] ? len[(i + 1) * w + j + 1] + 1 : Math.max(len[(i + 1) * w + j], len[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length || j < midB.length) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
        out.push(same(midA[i]));
        i++;
        j++;
      } else if (j >= midB.length || (i < midA.length && len[(i + 1) * w + j] >= len[i * w + j + 1])) {
        out.push({ kind: "del", text: midA[i++] });
      } else {
        out.push({ kind: "add", text: midB[j++] });
      }
    }
  }
  out.push(...a.slice(a.length - tail).map(same));
  return out;
}

/** 足した行と消した行の数 */
export function lineCounts(diff: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const d of diff) {
    if (d.kind === "add") added++;
    else if (d.kind === "del") removed++;
  }
  return { added, removed };
}
