// 非同期のテストの補助（待っている続きを流す・外から解決する Promise・偽の読み込み。テストからだけ使う）。Node・DOM に依存しない

/** 待っている Promise の続きを流す（setTimeout 0 を 1 回。vi.useFakeTimers で setTimeout を偽にしている間は進まない） */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 外から解決できる Promise */
export function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 頼まれた読み込みを列に積み、テストから解決する偽の読み込み */
export function fakeLoader<Q, R>(): { load(query: Q): Promise<R>; calls: { query: Q; resolve(value: R): void; reject(error: unknown): void }[] } {
  const calls: { query: Q; resolve(value: R): void; reject(error: unknown): void }[] = [];
  return {
    calls,
    load(query) {
      const d = deferred<R>();
      calls.push({ query, resolve: d.resolve, reject: d.reject });
      return d.promise;
    },
  };
}
