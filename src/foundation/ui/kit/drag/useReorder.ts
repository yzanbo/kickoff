import { useEffect, useRef, useState, type DragEvent } from "react";
import { isNoopMove, type DropSide } from "@/foundation/ui/lib/moveInList";
import { startDragGhost } from "@/foundation/ui/kit/dragGhost";
import { dragAttrs } from "./dragAttrs";

/** 前後を決める向き（x = 横に並んだ物の左右の半分 / y = 縦に並んだ物（メニューの項目など）の上下の半分） */
type Axis = "x" | "y";

/** ▾ にドラッグを重ねたまま、既定でこのくらい待つと onSpring を呼ぶ（Finder のフォルダと同じく、隠れた所へも落とせるように） */
const SPRING_MS = 600;

/**
 * 並び keys の from を to に落としたとき、前に入るか後ろに入るか（sideBy: "order"）: 上（前）から下（後ろ）へは相手の後ろ、
 * 下から上へは前（どちらも相手がいた位置に収まる）。どちらかが並びにない・同じなら null
 */
export function sideByOrder<K>(keys: readonly K[], from: K, to: K): DropSide | null {
  const a = keys.indexOf(from);
  const b = keys.indexOf(to);
  if (a < 0 || b < 0 || a === b) return null;
  return a < b ? "after" : "before";
}

export interface ReorderOptions<K> {
  /** いまの並び */
  keys: readonly K[];
  /** dataTransfer の種類（同じ種類のドラッグの間だけ落とせる） */
  type: string;
  /** 前後を決める向き（既定 x。itemProps・attrsFor で物ごとに替えられる） */
  axis?: Axis;
  /** 前後の決め方（half = 落とす先の物の半分で（既定）/ order = 動かす向きで。グループ・プロジェクトの並べ替え） */
  sideBy?: "half" | "order";
  /** 並べ替えられる物か（ほかはつかめず、落とす先にもならない。省くとすべて） */
  can?: (key: K) => boolean;
  /** つかんだ次の回に呼ぶ（まだ描いていない一覧の行も描くなど。動かしている印の state より先） */
  onStart?: () => void;
  /** 落とした（並びが変わる所だけ）。並びは呼ぶ側が覚える */
  onMove(from: K, to: K, side: DropSide): void;
  /** endProps に重ねたまま onSpring を呼ぶまでの時間 */
  springMs?: number;
}

type DropAt<K> = { key: K; side: DropSide };
type DropHandlers = Partial<Record<"onDragOver" | "onDragLeave" | "onDrop", (e: DragEvent) => void>>;

/**
 * ドラッグで並べ替える（ビューのタブ・タグ・グループ・プロジェクト・タブのまとまりなど）。落としても並びが変わらない所
 * （自分の上・すぐ前の後ろ・すぐ後ろの前）には線を出さず落とせない。
 * 物に付けるのは itemProps（つかむ・落とす先の両方）か、つかむ所 handle と落とす先 dropProps（ほかの落とし先と同じ要素に重ねるときは over・leave・drop）。
 * 入る位置は物の data-drop（before / after。横に並ぶ物は data-drop-axis="x"）、動かしている物は data-drag-source、endProps を付けた物（入りきらない物を入れた ▾）は data-drop="end"
 */
export function useReorder<K>({ keys, type, axis = "x", sideBy = "half", can = () => true, onStart, onMove, springMs = SPRING_MS }: ReorderOptions<K>) {
  const [dragging, setDragging] = useState<K | null>(null);
  const [drop, setDropState] = useState<DropAt<K> | null>(null);
  const [overEnd, setOverEnd] = useState(false);
  const spring = useRef<number | undefined>(undefined);
  const stopSpring = () => {
    window.clearTimeout(spring.current);
    spring.current = undefined;
  };
  useEffect(() => stopSpring, []);
  /** 入る位置を変える（同じなら描き直さない） */
  const setDrop = (next: DropAt<K> | null) => {
    if (next === null ? drop !== null : drop === null || drop.side !== next.side || !Object.is(drop.key, next.key)) setDropState(next);
  };
  const end = () => {
    setDragging(null);
    setDropState(null);
    setOverEnd(false);
    stopSpring();
  };
  /** いまの位置で落とせる先（なければ null） */
  const targetOf = (e: DragEvent, key: K, along: Axis): DropAt<K> | null => {
    if (dragging === null || !can(key)) return null;
    let side: DropSide | null;
    if (sideBy === "order") side = sideByOrder(keys, dragging, key);
    else {
      const r = e.currentTarget.getBoundingClientRect();
      side = (along === "y" ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2) ? "before" : "after";
    }
    return side === null || isNoopMove(keys, dragging, key, side) ? null : { key, side };
  };
  /** いちばん後ろへ落とす先（もういちばん後ろなら null） */
  const lastTarget = (): DropAt<K> | null => {
    const last = keys.at(-1);
    if (dragging === null || last === undefined || isNoopMove(keys, dragging, last, "after")) return null;
    return { key: last, side: "after" };
  };
  const dropOn = (e: DragEvent, target: DropAt<K> | null) => {
    if (target && dragging !== null) {
      e.preventDefault();
      onMove(dragging, target.key, target.side);
    }
    end();
  };
  const isMine = (e: DragEvent) => e.dataTransfer.types.includes(type);
  /** dragover。この並べ替えのドラッグでなければ false（チャットのドロップなど、ほかの処理に任せる）。key が null の所には落とせない */
  const over = (e: DragEvent, key: K | null, along: Axis = axis): boolean => {
    if (!isMine(e)) return false;
    const target = key === null ? null : targetOf(e, key, along);
    setDrop(target);
    if (target) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
    return true;
  };
  /** dragleave（要素の外へ出たとき、その物の入る位置を消す） */
  const leave = (e: DragEvent, key: K | null) => {
    if (key === null || e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDropState((d) => (d !== null && Object.is(d.key, key) ? null : d));
  };
  /** drop。この並べ替えのドロップでなければ false */
  const dropAt = (e: DragEvent, key: K | null, along: Axis = axis): boolean => {
    if (!isMine(e)) return false;
    dropOn(e, key === null ? null : targetOf(e, key, along));
    return true;
  };
  /** つかむ所に付ける（並べ替えられない物は undefined） */
  const handle = (key: K) =>
    can(key)
      ? {
          onDragStart: (e: DragEvent) => {
            e.dataTransfer.setData(type, String(key));
            e.dataTransfer.effectAllowed = "move";
            // 半透明の写しがカーソルに付いて動く。動かしている印の state は次の回（dragstart の中で描き直すと、ドラッグが取り消されることがある）
            startDragGhost(e, { after: () => (onStart?.(), setDragging(key)) });
          },
          onDragEnd: end,
        }
      : undefined;
  /** 動かしている途中（薄く）・入る位置の線の属性（並べ替えられない物は付けない） */
  const attrsFor = (key: K, along: Axis = axis) =>
    can(key) ? dragAttrs(drop !== null && Object.is(drop.key, key) && drop.side, { source: dragging !== null && Object.is(dragging, key), axis: along }) : {};
  /** 落とす先にする（並べ替えられない物は付けない） */
  const dropProps = (key: K, along: Axis = axis): DropHandlers =>
    can(key)
      ? {
          onDragOver: (e) => void over(e, key, along),
          onDragLeave: (e) => leave(e, key),
          onDrop: (e) => void dropAt(e, key, along),
        }
      : {};
  return {
    dragging,
    over,
    leave,
    drop: dropAt,
    handle,
    attrsFor,
    dropProps,
    /** 並べ替える物に付ける（つかんで動かす・落とす先）。along はこの物の前後を決める向き */
    itemProps: (key: K, along: Axis = axis) => ({ draggable: true as const, ...attrsFor(key, along), ...handle(key), ...dropProps(key, along) }),
    /** 入りきらない物を入れた ▾ に付ける（落とすといちばん後ろへ。重ねたまま待つと onSpring（メニューを開く）を呼ぶ） */
    endProps: (onSpring: (el: HTMLElement) => void) => ({
      "data-drop": overEnd ? ("end" as const) : undefined,
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!isMine(e) || dragging === null) return;
        e.preventDefault();
        const target = lastTarget();
        e.dataTransfer.dropEffect = target ? "move" : "none";
        setOverEnd(Boolean(target));
        setDropState(null);
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
