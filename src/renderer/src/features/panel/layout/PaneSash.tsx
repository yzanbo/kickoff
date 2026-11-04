import type { CSSProperties, RefObject } from "react";
import { startHorizontalDrag, startVerticalDrag } from "@/hooks/dragResize";
import { resizeAt, type FracRect, type Sash } from "./paneGeometry";
import type { PaneNode } from "./paneLayout";

/** パネル全体に対する割合の位置を、絶対配置の style にする（top・height から tabs を引くと、タブの列の下の中身の位置） */
export function fracStyle(r: FracRect, tabs = false): CSSProperties {
  const pct = (n: number) => `${n * 100}%`;
  return tabs
    ? { left: pct(r.x), top: `calc(${pct(r.y)} + var(--split-tabs-h))`, width: pct(r.w), height: `calc(${pct(r.h)} - var(--split-tabs-h))` }
    : { left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) };
}

/** path の分割（なければ undefined） */
function splitAt(root: PaneNode, path: readonly number[]) {
  let node: PaneNode | undefined = root;
  for (const i of path) node = node?.type === "split" ? node.children[i] : undefined;
  return node?.type === "split" ? node : undefined;
}

/**
 * ペインの境目のつまみ（左右の境目は縦の線、上下の境目は横の線）。ドラッグで両隣の大きさを変え、ダブルクリックで等分に戻す。
 * container はペインを並べる要素（割合をピクセルに直すのに使う）
 */
export function PaneSash({
  sash,
  root,
  container,
  onResize,
  onEqualize,
  onResizing,
}: {
  sash: Sash;
  root: PaneNode;
  container: RefObject<HTMLElement | null>;
  onResize: (path: number[], sizes: number[]) => void;
  onEqualize: (path: number[]) => void;
  /** ドラッグ中か（中身の上でポインターを奪われないようにする） */
  onResizing: (resizing: boolean) => void;
}) {
  const row = sash.dir === "row";
  const { split } = sash;
  const style: CSSProperties = row
    ? { left: `${(split.x + split.w * sash.at) * 100}%`, top: `${split.y * 100}%`, height: `${split.h * 100}%` }
    : { top: `${(split.y + split.h * sash.at) * 100}%`, left: `${split.x * 100}%`, width: `${split.w * 100}%` };

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = container.current?.getBoundingClientRect();
    const node = splitAt(root, sash.path);
    if (!box || !node) return;
    // 分割の左端（上端）と幅（高さ）をピクセルで
    const origin = row ? box.left + box.width * split.x : box.top + box.height * split.y;
    const length = row ? box.width * split.w : box.height * split.h;
    const handlers = {
      move: (client: number) => onResize(sash.path, resizeAt(node.sizes, sash.index, (client - origin) / length)),
      end: () => onResizing(false),
    };
    onResizing(true);
    if (row) startHorizontalDrag(e, handlers);
    else startVerticalDrag(e, handlers);
  };

  return (
    <div
      className={row ? "split-sash split-sash-row" : "split-sash split-sash-column"}
      style={style}
      role="separator"
      aria-orientation={row ? "vertical" : "horizontal"}
      aria-label={row ? "ペインの幅を変える" : "ペインの高さを変える"}
      title="ドラッグで大きさを変える（ダブルクリックで等分に戻す）"
      onPointerDown={start}
      onDoubleClick={() => onEqualize(sash.path)}
    />
  );
}
