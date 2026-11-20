import { useEffect, useRef, useState, type DragEvent } from "react";
import { isNoopMove, type DropSide } from "@/foundation/ui/lib/moveInList";
import { startDragGhost } from "@/foundation/ui/kit/dragGhost";
import { dragAttrs } from "./dragAttrs";

/** 前後を決める向き（x = 横に並んだ物の左右の半分 / y = 縦に並んだ物（メニューの項目など）の上下の半分） */
type Axis = "x" | "y";

/** ▾ にドラッグを重ねたまま、既定でこのくらい待つと onSpring を呼ぶ（Finder のフォルダと同じく、隠れた所へも落とせるように） */
const SPRING_MS = 600;

export interface ReorderOptions<K> {
  /** いまの並び */
  keys: readonly K[];
  /** dataTransfer の種類（同じ種類のドラッグの間だけ落とせる） */
  type: string;
  /** 前後を決める向き（既定 x。itemProps で物ごとに替えられる） */
  axis?: Axis;
  /** 落とした（並びが変わる所だけ）。並びは呼ぶ側が覚える */
  onMove(from: K, to: K, side: DropSide): void;
  /** endProps に重ねたまま onSpring を呼ぶまでの時間 */
  springMs?: number;
}

/**
 * ドラッグで並べ替える（ビューのタブ・タグなど）。物の左右の半分（縦なら上下の半分）で前に入るか後ろに入るかを決め、
 * 落としても並びが変わらない所（自分の上・すぐ前の後ろ・すぐ後ろの前）には線を出さず落とせない。
 * 入る位置は物の data-drop（before / after。横に並ぶ物は data-drop-axis="x"）、動かしている物は data-drag-source、endProps を付けた物（入りきらない物を入れた ▾）は data-drop="end"
 */
export function useReorder<K>({ keys, type, axis = "x", onMove, springMs = SPRING_MS }: ReorderOptions<K>) {
  const [dragging, setDragging] = useState<K | null>(null);
  const [drop, setDrop] = useState<{ key: K; side: DropSide } | null>(null);
  const [overEnd, setOverEnd] = useState(false);
  const spring = useRef<number | undefined>(undefined);
  const stopSpring = () => {
    window.clearTimeout(spring.current);
    spring.current = undefined;
  };
  useEffect(() => stopSpring, []);
  const end = () => {
    setDragging(null);
    setDrop(null);
    setOverEnd(false);
    stopSpring();
  };
  /** いまの位置で落とせる先（なければ null） */
  const targetOf = (e: DragEvent<HTMLElement>, key: K, along: Axis): { key: K; side: DropSide } | null => {
    if (dragging === null) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const side: DropSide = (along === "y" ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2) ? "before" : "after";
    return isNoopMove(keys, dragging, key, side) ? null : { key, side };
  };
  /** いちばん後ろへ落とす先（もういちばん後ろなら null） */
  const lastTarget = (): { key: K; side: DropSide } | null => {
    const last = keys.at(-1);
    if (dragging === null || last === undefined || isNoopMove(keys, dragging, last, "after")) return null;
    return { key: last, side: "after" };
  };
  const dropOn = (e: DragEvent<HTMLElement>, target: { key: K; side: DropSide } | null) => {
    if (target && dragging !== null) {
      e.preventDefault();
      onMove(dragging, target.key, target.side);
    }
    end();
  };
  return {
    dragging,
    /** 並べ替える物に付ける（つかんで動かす・落とす先）。along はこの物の前後を決める向き */
    itemProps: (key: K, along: Axis = axis) => ({
      draggable: true as const,
      ...dragAttrs(drop !== null && Object.is(drop.key, key) && drop.side, { source: dragging !== null && Object.is(dragging, key), axis: along }),
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.setData(type, String(key));
        e.dataTransfer.effectAllowed = "move";
        // 半透明の写しがカーソルに付いて動く。動かしている印の state は次の回
        startDragGhost(e, { after: () => setDragging(key) });
      },
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!e.dataTransfer.types.includes(type)) return;
        const target = targetOf(e, key, along);
        setDrop(target);
        if (!target) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop((d) => (d !== null && Object.is(d.key, key) ? null : d));
      },
      onDrop: (e: DragEvent<HTMLElement>) => dropOn(e, targetOf(e, key, along)),
      onDragEnd: end,
    }),
    /** 入りきらない物を入れた ▾ に付ける（落とすといちばん後ろへ。重ねたまま待つと onSpring（メニューを開く）を呼ぶ） */
    endProps: (onSpring: (el: HTMLElement) => void) => ({
      "data-drop": overEnd ? ("end" as const) : undefined,
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!e.dataTransfer.types.includes(type) || dragging === null) return;
        e.preventDefault();
        const target = lastTarget();
        e.dataTransfer.dropEffect = target ? "move" : "none";
        setOverEnd(Boolean(target));
        setDrop(null);
        if (spring.current === undefined) {
          const el = e.currentTarget;
          spring.current = window.setTimeout(() => {
            spring.current = undefined;
            onSpring(el);
          }, springMs);
        }
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOverEnd(false);
        stopSpring();
      },
      onDrop: (e: DragEvent<HTMLElement>) => dropOn(e, lastTarget()),
    }),
  };
}
