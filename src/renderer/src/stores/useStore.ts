// 店（createStore.ts・keyedStore.ts）を React から読む hooks。描いている間はその値を購読し、使っている間は読み込みを頼む（retain）
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Store } from "./createStore";
import { EMPTY_STATE, type KeyedStore, type StoreState } from "./keyedStore";

interface UseOptions {
  /** false の間は読み込みを頼まない（届いている値は読める。閉じているポップオーバーなど）。初めは true */
  active?: boolean;
}

/**
 * 値を読まずに、読み込みの様子（届いたか・読み込み中か・失敗の文）だけを読む。
 * 値が変わっても、様子が変わらなければ描き直さない（値は別の選び方で読む部品のため。チャットの一覧など）
 */
export function useStoreStatus<T>(store: Store<T>, { active = true }: UseOptions = {}): { loaded: boolean; loading: boolean; error: string | undefined } {
  useEffect(() => (active ? store.retain() : undefined), [store, active]);
  const loaded = useSyncExternalStore(store.subscribe, () => store.get().loaded);
  const loading = useSyncExternalStore(store.subscribe, () => store.get().loading);
  const error = useSyncExternalStore(store.subscribe, () => store.get().error);
  return { loaded, loading, error };
}

const noSubscribe = () => () => {};

/** key ごとの店の、1 つの key の様子（key が undefined なら何も読まない） */
export function useKeyedStore<K extends string | number, T>(store: KeyedStore<K, T>, key: K | undefined, { active = true }: UseOptions = {}): StoreState<T> {
  const subscribe = useCallback((listener: () => void) => (key === undefined ? noSubscribe() : store.subscribe(key, listener)), [store, key]);
  const state = useSyncExternalStore(subscribe, () => (key === undefined ? EMPTY_STATE : store.get(key)));
  useEffect(() => (active && key !== undefined ? store.retain(key) : undefined), [store, key, active]);
  return state;
}

/**
 * key ごとの店の、いくつかの key の様子を引く関数（グループ名を引くタブの列・作業場所で段に分けるボードなど）。
 * どれかの key が変わると描き直し、返す関数も新しくなる（memo の deps に入れてよい）
 */
export function useKeyedStores<K extends string | number, T>(store: KeyedStore<K, T>, keys: readonly K[], { active = true }: UseOptions = {}): (key: K) => StoreState<T> {
  const version = useSyncExternalStore(store.subscribeAll, store.version);
  const unique = [...new Set(keys)];
  const id = unique.map(String).sort().join("\n");
  useEffect(() => {
    if (!active || !id) return;
    const releases = unique.map((key) => store.retain(key));
    return () => releases.forEach((release) => release());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 読む key は id が変わったときだけ数え直す
  }, [store, id, active]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 店が変わるたびに（version）新しい関数にする
  return useMemo(() => (key: K) => store.get(key), [store, version]);
}
