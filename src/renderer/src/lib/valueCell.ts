/**
 * 1 つの値の入れ物（React の外で持ち、変わったら知らせる。部品は useSyncExternalStore で読み、選んだ値が変わったときだけ描き直す）。
 * 同じ値（Object.is）を入れても知らせない
 */
export interface ValueCell<T> {
  get(): T;
  set(value: T): void;
  /** 変わったら listener を呼ぶ。やめるときは返り値を呼ぶ */
  subscribe(listener: () => void): () => void;
}

export function createValueCell<T>(initial: T): ValueCell<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
