/** 値を持たない知らせ（つながった・変わったなど）。受け手は登録の順に呼ぶ（画面の店の家族は @/foundation/ui/store から出し直す） */
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
