/** 値を持たない知らせ（つながった・変わったなど）。受け手は登録の順に呼ぶ */
export interface Signal<A = void> {
  emit(arg: A): void;
  /** 知らせを受ける。やめるときは返り値を呼ぶ */
  subscribe(listener: (arg: A) => void): () => void;
}

export function createSignal<A = void>(): Signal<A> {
  const listeners = new Set<(arg: A) => void>();
  return {
    emit: (arg) => {
      for (const listener of [...listeners]) listener(arg);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
