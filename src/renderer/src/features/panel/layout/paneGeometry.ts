import type { PaneNode, SplitDir } from "./paneTree";

/** パネル全体を 1 としたときの位置と大きさ（割合） */
export interface FracRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 境目のつまみ: path の分割の、index 番目と index+1 番目の子の境目 */
export interface Sash {
  path: number[];
  index: number;
  dir: SplitDir;
  /** 分割全体の位置と大きさ */
  split: FracRect;
  /** 分割の中での境目の位置（割合） */
  at: number;
}

/** 木から、各ペインの位置と大きさ・境目のつまみを求める（どちらも画面の並び順） */
export function layoutRects(root: PaneNode): { panes: { id: string; rect: FracRect }[]; sashes: Sash[] } {
  const panes: { id: string; rect: FracRect }[] = [];
  const sashes: Sash[] = [];
  const visit = (node: PaneNode, rect: FracRect, path: number[]) => {
    if (node.type === "pane") {
      panes.push({ id: node.id, rect });
      return;
    }
    let offset = 0;
    node.children.forEach((child, i) => {
      const size = node.sizes[i];
      const childRect =
        node.dir === "row"
          ? { x: rect.x + rect.w * offset, y: rect.y, w: rect.w * size, h: rect.h }
          : { x: rect.x, y: rect.y + rect.h * offset, w: rect.w, h: rect.h * size };
      if (i > 0) sashes.push({ path, index: i - 1, dir: node.dir, split: rect, at: offset });
      visit(child, childRect, [...path, i]);
      offset += size;
    });
  };
  visit(root, { x: 0, y: 0, w: 1, h: 1 }, []);
  return { panes, sashes };
}

/** タブを落とす場所（ペインの中身の端なら、その側に分けて置く。真ん中ならそのペインへ移す） */
export type DropZone = "left" | "right" | "top" | "bottom" | "center";

/** ペインの中身の上の位置（左上からの割合 0〜1）から、落とす場所を決める。端から edge（既定 1/4）以内なら、いちばん近い端 */
export function dropZoneAt(rx: number, ry: number, edge = 0.25): DropZone {
  const distances: [DropZone, number][] = [
    ["left", rx],
    ["right", 1 - rx],
    ["top", ry],
    ["bottom", 1 - ry],
  ];
  const [zone, d] = distances.reduce((a, b) => (b[1] < a[1] ? b : a));
  return d < edge ? zone : "center";
}

/** 落とす場所ごとの、分ける向きと新しいペインを置く側（真ん中は分けない） */
export function splitOfZone(zone: DropZone): { dir: SplitDir; side: "before" | "after" } | null {
  if (zone === "left") return { dir: "row", side: "before" };
  if (zone === "right") return { dir: "row", side: "after" };
  if (zone === "top") return { dir: "column", side: "before" };
  if (zone === "bottom") return { dir: "column", side: "after" };
  return null;
}

/**
 * 境目をドラッグしたあとの割合。pointer は分割の中での位置（割合）。両隣の 2 つの合計は変えず、min より小さくしない
 */
export function resizeAt(sizes: readonly number[], index: number, pointer: number, min = 0.08): number[] {
  const next = [...sizes];
  const start = sizes.slice(0, index).reduce((a, b) => a + b, 0);
  const pair = sizes[index] + sizes[index + 1];
  const lo = Math.min(min, pair / 2);
  next[index] = Math.max(lo, Math.min(pair - lo, pointer - start));
  next[index + 1] = pair - next[index];
  return next;
}

/** タブの列の上の x 座標から、落とす位置（何番目の前か）を決める。各タブの左端と幅を渡す */
export function insertIndexAt(clientX: number, tabs: readonly { left: number; width: number }[]): number {
  const index = tabs.findIndex((t) => clientX < t.left + t.width / 2);
  return index < 0 ? tabs.length : index;
}
