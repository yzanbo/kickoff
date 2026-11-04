import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { Setting } from "@/lib/storage";
import { useSetting } from "./useSetting";

/** ドラッグの向き（x = 左右に動かして幅 / y = 上下に動かして高さ） */
export type DragAxis = "x" | "y";

/**
 * つまみ（区切り線）のドラッグ。つまみがポインターを捕まえるので、指がつまみの外に出ても追従する。
 * move には、その向きのポインターの位置（clientX / clientY）が届く
 */
export function startPointerDrag(e: ReactPointerEvent<HTMLElement>, axis: DragAxis, { move, end }: { move: (client: number) => void; end: () => void }) {
  e.preventDefault();
  const handle = e.currentTarget;
  handle.setPointerCapture(e.pointerId);
  const onMove = (ev: PointerEvent) => move(axis === "x" ? ev.clientX : ev.clientY);
  const onUp = () => {
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    end();
  };
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
}

/**
 * ドラッグ中の大きさ: 始めの大きさ start から、指が動いた分 moved だけ変える（つまみが欄の右・下の端（end）なら右・下へ動かすほど大きく、
 * 左・上の端（start）なら左・上へ動かすほど大きく）。min〜max に収めて丸める（max が min より小さければ min）
 */
export function draggedSize(start: number, moved: number, { edge, min, max }: { edge: "start" | "end"; min: number; max: number }): number {
  return Math.round(Math.max(min, Math.min(max, start + (edge === "end" ? moved : -moved))));
}

/** ドラッグ中に大きさを書き込む先（CSS 変数か、style のプロパティ） */
type SizeProperty = "width" | "height" | "maxHeight" | "flexBasis" | `--${string}`;

interface DragSizeOptions<E extends HTMLElement> {
  /** 覚える設定（lib/storageKeys.ts。ダブルクリックでその初めの値に戻す） */
  setting: Setting<number>;
  /** 既定は x（幅） */
  axis?: DragAxis;
  /** つまみが欄のどちらの端にあるか（end = 右・下の端（既定）/ start = 左・上の端） */
  edge?: "start" | "end";
  min?: number;
  /** 上限（数か、ドラッグを始めたときに決める関数） */
  max?: number | (() => number);
  /** 欄を並べる要素（親）の中で、反対側に残す大きさ（上限は親の大きさからこれを引いたもの） */
  keep?: number;
  /** 大きさの単位（% は親の大きさに対する割合。上下に分けた欄の割合など） */
  unit?: "px" | "%";
  /** ドラッグ中に書き込む先（既定は width / height）。CSS 変数なら --… */
  write?: SizeProperty;
  /** 大きさを測る欄（既定はこの hook の paneRef を付けた要素） */
  pane?: RefObject<E | null>;
  /** 書き込む要素（既定は欄。CSS 変数を外側の要素で持つときなど） */
  target?: () => HTMLElement | null;
  /** ドラッグを始めたとき（横幅いっぱいをやめる、など） */
  onStart?: () => void;
  /** 大きさを決めたとき（ドラッグを終えた・ダブルクリックで戻した） */
  onChange?: (size: number) => void;
}

/**
 * 欄の大きさ（幅・高さ）を、境目のつまみのドラッグで変える（setting に覚える。ダブルクリックで初めの値に戻す）。
 * ドラッグを始めたときの欄の大きさ（いま見えている大きさ）から、指が動いた分だけ変える（つまんだところが指の下にあるまま動く）。
 * ドラッグ中は描き直さず、書き込む先（write）だけを書き換えて指に追従させ、離したときに覚える。
 * paneRef を欄に（pane を渡さないとき）、handle をつまみに渡す
 */
export function useDragSize<E extends HTMLElement = HTMLElement>({
  setting,
  axis = "x",
  edge = "end",
  min = 0,
  max = Infinity,
  keep,
  unit = "px",
  write,
  pane,
  target,
  onStart,
  onChange,
}: DragSizeOptions<E>) {
  const [size, setSize] = useSetting(setting);
  const [resizing, setResizing] = useState(false);
  const ownPane = useRef<E>(null);
  const paneRef = pane ?? ownPane;

  const change = (next: number) => {
    setSize(next);
    onChange?.(next);
  };

  const startResize = (e: ReactPointerEvent<HTMLElement>) => {
    const el = paneRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const whole = axis === "x" ? parent.clientWidth : parent.clientHeight;
    if (unit === "%" && !whole) return;
    // px を単位に直す倍率（% なら親の大きさに対する割合）
    const scale = unit === "%" ? 100 / whole : 1;
    const rect = el.getBoundingClientRect();
    const start = (axis === "x" ? rect.width : rect.height) * scale;
    const limit = Math.min(typeof max === "function" ? max() : max, keep === undefined ? Infinity : (whole - keep) * scale);
    const into = target?.() ?? el;
    const property = write ?? (axis === "x" ? "width" : "height");
    const from = axis === "x" ? e.clientX : e.clientY;
    let next = Math.round(start);
    onStart?.();
    setResizing(true);
    startPointerDrag(e, axis, {
      move: (client) => {
        next = draggedSize(start, (client - from) * scale, { edge, min, max: limit });
        const value = `${next}${unit}`;
        if (property.startsWith("--")) into.style.setProperty(property, value);
        else into.style[property as Exclude<SizeProperty, `--${string}`>] = value;
      },
      end: () => {
        setResizing(false);
        change(next);
      },
    });
  };

  const reset = () => change(setting.initial);

  return {
    /** 覚えている大きさ */
    size,
    /** 大きさを決める（覚える） */
    setSize: change,
    resizing,
    /** 大きさを測る欄に付ける（pane を渡したときは、渡した ref） */
    paneRef,
    startResize,
    /** 初めの大きさに戻す */
    reset,
    /** つまみ（境目）に渡す（ドラッグで変える・ダブルクリックで戻す） */
    handle: {
      role: "separator",
      "aria-orientation": axis === "x" ? ("vertical" as const) : ("horizontal" as const),
      title: axis === "x" ? "ドラッグで幅を変える（ダブルクリックで元に戻す）" : "ドラッグで高さを変える（ダブルクリックで元に戻す）",
      onPointerDown: startResize,
      onDoubleClick: reset,
    },
  };
}
