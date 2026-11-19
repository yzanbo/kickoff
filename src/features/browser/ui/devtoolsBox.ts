import type { DevtoolsBounds } from "@shared/foundation/ipc";

// 右・下に並べた開発者ツールの置き場所の比べ方（DOM に依らないので、テストできる）

/** 2 つの範囲が重なるか（辺が接するだけなら重ならない） */
export function boxesOverlap(a: DevtoolsBounds, b: DevtoolsBounds): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** 範囲の重なった部分（重ならなければ null） */
export function intersectBoxes(a: DevtoolsBounds, b: DevtoolsBounds): DevtoolsBounds | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/** 同じ置き場所か（0.5px 未満の違いは同じとみなし、知らせ直さない） */
export function sameBox(a: DevtoolsBounds | null | undefined, b: DevtoolsBounds | null | undefined): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}
