// 店（createStore.ts・keyedStore.ts。形は storeTypes.ts）を React から読む hooks。描いている間はその値を購読し、使っている間は読み込みを頼む（retain）
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { EMPTY_STATE, type KeyedStore, type Store, type StoreState } from "./storeTypes";

interface UseOptions {
  /** false の間は読み込みを頼まない（届いている値は読める。閉じているポップオーバーなど）。初めは true */
  active?: boolean;
}

/** 頼んだのに、まだ何も届いていない様子（読み込みは描いたあとの effect で始まるので、最初の描画から読み込み中として見せる） */
const STARTING: StoreState<never> = Object.freeze({ data: undefined, error: undefined, loading: true, loaded: false });

/** 使っている（active）読み込む店で、まだ値も失敗も届いていなければ読み込み中にする（最初の描画で「ない」「使えない」と見せない） */
function shown<T>(state: StoreState<T>, active: boolean, loads: boolean): StoreState<T> {
  return active && loads && !state.loaded && state.error === undefined && !state.loading ? STARTING : state;
}

/** 値を 1 つ持つ店の様子（値・読み込みの様子が変わったら描き直す） */
export function useStore<T>(store: Store<T>, { active = true }: UseOptions = {}): StoreState<T> {
  const state = useSyncExternalStore(store.subscribe, store.get);
  useEffect(() => (active ? store.retain() : undefined), [store, active]);
  return shown(state, active, store.loads);
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
  return { loaded, loading: loading || (active && store.loads && !loaded && error === undefined), error };
}

const noSubscribe = () => () => {};

/** key ごとの店の、1 つの key の様子（key が undefined なら何も読まない） */
export function useKeyedStore<K extends string | number, T>(store: KeyedStore<K, T>, key: K | undefined, { active = true }: UseOptions = {}): StoreState<T> {
  const subscribe = useCallback((listener: () => void) => (key === undefined ? noSubscribe() : store.subscribe(key, listener)), [store, key]);
  const state = useSyncExternalStore(subscribe, () => (key === undefined ? EMPTY_STATE : store.get(key)));
  useEffect(() => (active && key !== undefined ? store.retain(key) : undefined), [store, key, active]);
  return shown(state, active && key !== undefined, store.loads);
}

/**
 * key ごとの店の、いくつかの key の様子を引く関数（グループ名を引くタブの列・作業場所で段に分けるボードなど）。
 * 渡した key のどれかの様子が変わったときだけ描き直し、返す関数も新しくなる（memo の deps に入れてよい）。
 * ほかの key が変わっても描き直さない（返す関数はほかの key も引けるが、変わっても知らせない。読み込みも頼まない）
 */
export function useKeyedStores<K extends string | number, T>(store: KeyedStore<K, T>, keys: readonly K[], { active = true }: UseOptions = {}): (key: K) => StoreState<T> {
  const unique = [...new Set(keys)];
  const id = unique.map(String).sort().join("\n");
  const subscribe = useCallback(
    (listener: () => void) => {
      const offs = unique.map((key) => store.subscribe(key, listener));
      return () => offs.forEach((off) => off());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 読む key は id が変わったときだけ数え直す
    [store, id],
  );
  // 渡した key の様子の組（どれかが変わったときだけ別のものになる）
  const last = useRef<StoreState<T>[]>([]);
  const states = useSyncExternalStore(subscribe, () => {
    const next = unique.map((key) => store.get(key));
    if (next.length === last.current.length && next.every((s, i) => s === last.current[i])) return last.current;
    return (last.current = next);
  });
  useEffect(() => {
    if (!active || !id) return;
    const releases = unique.map((key) => store.retain(key));
    return () => releases.forEach((release) => release());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 読む key は id が変わったときだけ数え直す
  }, [store, id, active]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 渡した key の様子が変わるたびに（states）新しい関数にする
  return useMemo(() => (key: K) => store.get(key), [store, states]);
}
