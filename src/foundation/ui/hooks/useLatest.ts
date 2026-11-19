import { useInsertionEffect, useRef } from "react";

/**
 * 描くたびの最新の値を入れておく ref。押したとき・外の仕組み（CodeMirror・ターミナルなど）から呼ばれる関数の中で `.current` を読む。
 * 描く中で ref に書かない（React Compiler が部品を最適化から外す）ので、
 * 書くのは描いた結果を当てる段（useInsertionEffect。どの useLayoutEffect・useEffect よりも先に走る）。
 * effect の中だけで読む関数なら、こちらではなく React の useEffectEvent を使う
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useInsertionEffect(() => {
    ref.current = value;
  });
  return ref;
}
