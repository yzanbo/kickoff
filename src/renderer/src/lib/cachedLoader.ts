/** アプリ全体で 1 回だけ取得して使い回す（失敗したときは fallback を返し、次に呼ばれたときに取り直す） */
export function cachedLoader<T>(load: () => Promise<T>, fallback: T): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () =>
    (promise ??= load().catch(() => {
      promise = undefined;
      return fallback;
    }));
}
