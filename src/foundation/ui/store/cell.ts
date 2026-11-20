import { useMemo, useSyncExternalStore } from "react";

/**
 * 1 つの値の入れ物（React の外で持ち、変わったら知らせる）。部品は useCell で読み、選んだ値が変わったときだけ描き直す。
 * 同じ値（equals。既定は Object.is）を入れても知らせない
 */
export interface Cell<T> {
  get(): T;
  /** 値か、前の値から次の値を作る関数を入れる（T が関数の値の入れ物には、関数で包んで入れる） */
  set(next: T | ((prev: T) => T)): void;
  /** 変わったら listener を呼ぶ。やめるときは返り値を呼ぶ */
  subscribe(listener: () => void): () => void;
}

export function createCell<T>(initial: T, options: { equals?: (a: T, b: T) => boolean } = {}): Cell<T> {
  const equals = options.equals ?? Object.is;
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      const v = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
      if (equals(v, value)) return;
      value = v;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** useSyncExternalStore の getSnapshot（選んだ値が equals で前と同じなら、前の値をそのまま返して描き直さない） */
export function cellReader<T, S>(cell: Cell<T>, select: (value: T) => S, equals: (a: S, b: S) => boolean = Object.is): () => S {
  let last: { selected: S } | undefined;
  return () => {
    const selected = select(cell.get());
    if (last && equals(last.selected, selected)) return last.selected;
    last = { selected };
    return selected;
  };
}

const same = <T,>(value: T) => value;

/** 値を読む。select を渡すと、選んだ値が equals（既定は Object.is）で同じなら描き直さない */
export function useCell<T>(cell: Cell<T>): T;
export function useCell<T, S>(cell: Cell<T>, select: (value: T) => S, equals?: (a: S, b: S) => boolean): S;
export function useCell<T, S>(cell: Cell<T>, select?: (value: T) => S, equals?: (a: S, b: S) => boolean): T | S {
  // 残す: 選んだ値を覚える読み取り（getSnapshot。作り直すと覚えを捨て、select が新しい物を返すと毎回別の値になる）
  const read = useMemo(() => cellReader<T, T | S>(cell, select ?? same, equals as (a: T | S, b: T | S) => boolean), [cell, select, equals]);
  return useSyncExternalStore(cell.subscribe, read, read);
}
