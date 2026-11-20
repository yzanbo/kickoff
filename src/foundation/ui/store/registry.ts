/** 部品が口を置き、外から呼ぶ登録表（開いているエディタのカーソルを読む口など） */
export interface Registry<K, V> {
  /** 置く。返り値で外す（同じ key に置き直したあとなら、外しても後のものは残る） */
  set(key: K, value: V): () => void;
  get(key: K): V | undefined;
  values(): V[];
  /** 置いた・外したら listener を呼ぶ。やめるときは返り値を呼ぶ */
  subscribe(listener: () => void): () => void;
}

export function createRegistry<K, V>(): Registry<K, V> {
  const items = new Map<K, V>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    set(key, value) {
      items.set(key, value);
      notify();
      return () => {
        if (items.get(key) !== value) return;
        items.delete(key);
        notify();
      };
    },
    get: (key) => items.get(key),
    values: () => [...items.values()],
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
