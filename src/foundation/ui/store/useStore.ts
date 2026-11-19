// 店（createStore.ts・keyedStore.ts。形は storeTypes.ts）を React から読む hooks。描いている間はその値を購読し、使っている間は読み込みを頼む（retain）
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
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

/** いくつかの key の様子の組を読む関数（どれかが変わったときだけ別の配列を返す。useSyncExternalStore の getSnapshot） */
function statesReader<K extends string | number, T>(store: KeyedStore<K, T>, keys: readonly K[]): () => StoreState<T>[] {
  let last: StoreState<T>[] = [];
  return () => {
    const next = keys.map((key) => store.get(key));
    if (next.length === last.length && next.every((s, i) => s === last[i])) return last;
    return (last = next);
  };
}

/**
 * key ごとの店の、いくつかの key の様子を引く関数（グループ名を引くタブの列・作業場所で段に分けるボードなど）。
 * 渡した key のどれかの様子が変わったときだけ描き直し、返す関数も新しくなる（memo の deps に入れてよい）。
 * ほかの key が変わっても描き直さない（返す関数はほかの key も引けるが、変わっても知らせない。読み込みも頼まない）
 */
export function useKeyedStores<K extends string | number, T>(store: KeyedStore<K, T>, keys: readonly K[], { active = true }: UseOptions = {}): (key: K) => StoreState<T> {
  // 渡す配列は描くたびに作られることがあるので、key の組を文字にして、組が変わったときだけ数え直す（JSON なので数の key は数のまま戻る）
  const id = JSON.stringify([...new Set(keys)].sort());
  const unique = useMemo(() => JSON.parse(id) as K[], [id]);
  const subscribe = useCallback(
    (listener: () => void) => {
      const offs = unique.map((key) => store.subscribe(key, listener));
      return () => offs.forEach((off) => off());
    },
    [store, unique],
  );
  // 渡した key の様子の組（どれかが変わったときだけ別のものになる）
  const getStates = useMemo(() => statesReader(store, unique), [store, unique]);
  const states = useSyncExternalStore(subscribe, getStates);
  useEffect(() => {
    if (!active || unique.length === 0) return;
    const releases = unique.map((key) => store.retain(key));
    return () => releases.forEach((release) => release());
  }, [store, unique, active]);
  // 渡した key の様子が変わるたびに（states）新しい関数にする。渡した key は描いた時点の様子を、ほかの key は店のいまの値を返す
  return useMemo(() => {
    const byKey = new Map(unique.map((key, i) => [key, states[i]]));
    return (key: K) => byKey.get(key) ?? store.get(key);
  }, [store, unique, states]);
}
