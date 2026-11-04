import { useEffect, useState } from "react";
import { errorMessage } from "@shared/errors";

/** key ごとに覚えている結果（成功なら data、失敗なら error） */
export interface KeyedResult<T> {
  key: string;
  data?: T;
  error?: string;
}

interface Options<T> {
  /** key が同じでも取り直すきっかけ（変更の一覧の version など） */
  deps?: unknown[];
  /** false の間は取りに行かない（表示していないタブなど）。それまでの結果は残す */
  active?: boolean;
  /** 取り直した結果が前と同じなら、前の値のままにする（中身が同じなら描き直さない） */
  same?: (prev: T, next: T) => boolean;
}

/** 届いた結果を覚える（同じ key で中身も同じなら、前の値のまま） */
export function mergeKeyed<T>(prev: KeyedResult<T> | undefined, key: string, data: T, same?: (prev: T, next: T) => boolean): KeyedResult<T> {
  return prev?.key === key && prev.data !== undefined && same?.(prev.data, data) ? prev : { key, data };
}

/** いまの key の結果だけを出す（別の key のものは、読み込み中として扱う） */
export function currentKeyed<T>(state: KeyedResult<T> | undefined, key: string): KeyedResult<T> | undefined {
  return state?.key === key ? state : undefined;
}

/**
 * key（ファイル・コミット・作業場所など）ごとの非同期の読み込み。
 * key が変わるまでは前の結果を出し続け（取り直している間にちらつかない）、key が変わったら読み込み中に戻る。
 * 古い key の応答は捨てる（切り替えを素早く繰り返しても、前の応答で上書きされない）。
 * useAsync と違い、key の切り替えで前のデータを出さない
 */
export function useKeyedAsync<T>(key: string, load: () => Promise<T>, { deps = [], active = true, same }: Options<T> = {}) {
  const [state, setState] = useState<KeyedResult<T>>();
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    load().then(
      (data) => alive && setState((prev) => mergeKeyed(prev, key, data, same)),
      (e: unknown) => alive && setState({ key, error: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active, nonce, ...deps]);

  const current = currentKeyed(state, key);
  return {
    data: current?.data,
    error: current?.error,
    /** この key の結果（成功・失敗のどちらか）が届いたか */
    loaded: current !== undefined,
    /** 同じ key で取り直す */
    reload: () => setNonce((n) => n + 1),
    /** 届いている結果を書き換える（続きを足すなど。key が変わっていれば何もしない） */
    setData: (update: (prev: T) => T) =>
      setState((prev) => (prev?.key === key && prev.data !== undefined ? { key, data: update(prev.data) } : prev)),
  };
}
