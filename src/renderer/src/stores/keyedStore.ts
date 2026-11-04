// key（プロジェクトの ID など）ごとに値を持つ店の仕組み（値を 1 つだけ持つ店 createStore も、これを 1 つの key で使う）。
// 店の考え方（読み込み・失敗・知らせ・つなぎ直し）は createStore.ts の先頭に書く
import type { BusEvent } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { subscribeServerEvent, subscribeServerOpen } from "@/api/events";

/** 店の値の様子（部品はこれを読む。中身が変わるたびに別のものになり、変わらなければ同じもの） */
export interface StoreState<T> {
  /** 届いた値（まだなら undefined。取り直している間・失敗したあとも、前に届いた値を残す） */
  readonly data: T | undefined;
  /** 最後の読み込みの失敗の文（読めたら消える） */
  readonly error: string | undefined;
  /** 読み込んでいる最中か（初めて・取り直しのどちらも） */
  readonly loading: boolean;
  /** 値が届いたか（失敗だけなら false。失敗の前に届いた値があれば true のまま） */
  readonly loaded: boolean;
}

/** まだ何もない様子（どの店・key でも同じもの） */
export const EMPTY_STATE: StoreState<never> = Object.freeze({ data: undefined, error: undefined, loading: false, loaded: false });

export interface KeyedStoreOptions<K, T> {
  /** 読み込む（省けば読み込まず、set で入れた値だけを持つ） */
  load?: (key: K) => Promise<T>;
  /** サーバーの知らせで値を直す（関係なければ data をそのまま返す）。届いている key ごとに呼ぶ */
  reduce?: (data: T, event: BusEvent, key: K) => T;
  /** この知らせが来たら取り直す（読み込み中なら終わってからもう一度。使っていなければ、次に使うときに） */
  reloadOn?: (event: BusEvent, key: K) => boolean;
  /** この知らせが来たら、その key の値を捨てる（消えたプロジェクトのものなど） */
  dropOn?: (event: BusEvent) => K | undefined;
  /** 値が古くなるまでの時間（ms）。過ぎてから使うと、前の値を出したまま裏で取り直す（0 なら使い始めるたびに）。省けば古くならない */
  maxAge?: number;
  /** ウィンドウに戻ったとき、使っている値が古ければ取り直す */
  refreshOnFocus?: boolean;
}

/** key（プロジェクトの ID など）ごとに値を持つ店 */
export interface KeyedStore<K, T> {
  /** いまの様子（部品の外からも読める） */
  get(key: K): StoreState<T>;
  /** その key の様子が変わったら listener を呼ぶ。やめるときは返り値を呼ぶ */
  subscribe(key: K, listener: () => void): () => void;
  /** どれかの key の様子が変わったら listener を呼ぶ（いくつかの key を読む部品のため） */
  subscribeAll(listener: () => void): () => void;
  /** どれかの key の様子が変わるたびに増える数 */
  version(): number;
  /** 使い始める（まだない・古ければ読み込む）。使い終わったら返り値を呼ぶ（使っている値だけを、つながったとき・ウィンドウに戻ったときに取り直す） */
  retain(key: K): () => void;
  /** まだない・古ければ読み込む */
  ensure(key: K): void;
  /** 取り直す（読み込み中なら、終わってからもう一度）。届いた値を返す（失敗なら例外。待たなくてもよい） */
  reload(key: K): Promise<T>;
  /** 値を入れる（操作の応答で届いた一覧など）。読み込み中の依頼の結果は捨てる */
  set(key: K, value: T): void;
  /** 届いている値を直す（まだなければ何もしない。読み込み中なら、届いた値にも当てる） */
  update(key: K, change: (data: T) => T): void;
  /** 古いことにする（使っていればすぐ取り直す。届くまでは前の値を出す） */
  invalidate(key: K): void;
  /** 値を捨てる */
  drop(key: K): void;
}

interface Entry<T> {
  state: StoreState<T>;
  /** 最後に値が届いた時刻 */
  loadedAt: number;
  /** 次に使うときに取り直す（失敗した・古いと知らされた・つなぎ直した） */
  stale: boolean;
  /** いまの読み込みの番号（新しい読み込み・set で進む。番号の違う応答は捨てる） */
  request: number;
  /** 読み込み中に当てた変更（知らせ・update）。届いた値にもう一度当てる。読み込み中でなければ null */
  replay: ((data: T) => T)[] | null;
  /** 読み込み中に取り直しを頼まれた（終わったらもう一度読む） */
  again: boolean;
  /** reload を待っているもの */
  waiters: { resolve: (data: T) => void; reject: (error: unknown) => void }[];
}

export function createKeyedStore<K extends string | number, T>(options: KeyedStoreOptions<K, T> = {}): KeyedStore<K, T> {
  const { load, reduce, reloadOn, dropOn, maxAge, refreshOnFocus } = options;
  const entries = new Map<K, Entry<T>>();
  const listeners = new Map<K, Set<() => void>>();
  const allListeners = new Set<() => void>();
  // 使っている部品の数（key ごと。値を捨てて作り直しても数は残す）
  const users = new Map<K, number>();
  let version = 0;

  const inUse = (key: K) => (users.get(key) ?? 0) > 0;

  function notify(key: K) {
    version++;
    for (const listener of [...(listeners.get(key) ?? [])]) listener();
    for (const listener of [...allListeners]) listener();
  }

  function entryOf(key: K): Entry<T> {
    let entry = entries.get(key);
    if (!entry) {
      entry = { state: EMPTY_STATE, loadedAt: 0, stale: false, request: 0, replay: null, again: false, waiters: [] };
      entries.set(key, entry);
    }
    return entry;
  }

  function change(key: K, entry: Entry<T>, patch: Partial<Omit<StoreState<T>, "loaded">>) {
    const next = { ...entry.state, ...patch };
    entry.state = { ...next, loaded: next.data !== undefined };
    notify(key);
  }

  function settle(entry: Entry<T>, result: { data: T } | { error: unknown }) {
    for (const waiter of entry.waiters.splice(0)) {
      if ("data" in result) waiter.resolve(result.data);
      else waiter.reject(result.error);
    }
  }

  function start(key: K, entry: Entry<T>) {
    if (!load) return;
    const request = ++entry.request;
    entry.replay = [];
    entry.again = false;
    entry.stale = false;
    if (!entry.state.loading) change(key, entry, { loading: true });
    const current = () => entries.get(key) === entry && entry.request === request;
    let promise: Promise<T>;
    try {
      promise = load(key);
    } catch (e) {
      promise = Promise.reject(e);
    }
    promise.then(
      (value) => {
        if (!current()) return;
        const data = (entry.replay ?? []).reduce((d, apply) => apply(d), value);
        entry.replay = null;
        entry.loadedAt = Date.now();
        if (entry.again) {
          change(key, entry, { data, error: undefined });
          return start(key, entry);
        }
        change(key, entry, { data, error: undefined, loading: false });
        settle(entry, { data });
      },
      (error: unknown) => {
        if (!current()) return;
        entry.replay = null;
        if (entry.again) {
          change(key, entry, { error: errorMessage(error) });
          return start(key, entry);
        }
        // 失敗は覚えない（次に使うとき・つながったときに取り直す）
        entry.stale = true;
        change(key, entry, { error: errorMessage(error), loading: false });
        settle(entry, { error });
      },
    );
  }

  /** 取り直す（読み込み中なら、終わってからもう一度） */
  function restart(key: K, entry: Entry<T>) {
    if (entry.state.loading) entry.again = true;
    else start(key, entry);
  }

  const fresh = (entry: Entry<T>) => entry.state.loaded && !entry.stale && (maxAge === undefined || Date.now() - entry.loadedAt < maxAge);

  function ensure(key: K) {
    if (!load) return;
    const entry = entryOf(key);
    if (!entry.state.loading && !fresh(entry)) start(key, entry);
  }

  function update(key: K, apply: (data: T) => T) {
    const entry = entries.get(key);
    if (!entry) return;
    entry.replay?.push(apply);
    if (entry.state.data === undefined) return;
    const data = apply(entry.state.data);
    if (data !== entry.state.data) change(key, entry, { data });
  }

  function drop(key: K) {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    entry.request++;
    settle(entry, { error: new Error("読み込みをやめました") });
    notify(key);
  }

  if (reduce || reloadOn || dropOn) {
    subscribeServerEvent((event) => {
      const gone = dropOn?.(event);
      if (gone !== undefined) drop(gone);
      for (const [key, entry] of entries) {
        if (reduce) update(key, (data) => reduce(data, event, key));
        if (!reloadOn?.(event, key)) continue;
        if (inUse(key) || entry.state.loading) restart(key, entry);
        else entry.stale = true;
      }
    });
  }

  // つながったら、失敗した値を取り直す。つなぎ直したときは、知らせで直している値も（切れている間の知らせは届いていない）
  const followsEvents = Boolean(reduce || reloadOn);
  subscribeServerOpen((reconnect) => {
    for (const [key, entry] of entries) {
      if (reconnect && followsEvents) entry.stale = true;
      if (entry.stale && inUse(key)) restart(key, entry);
    }
  });

  if (refreshOnFocus && typeof window !== "undefined") {
    window.addEventListener("focus", () => {
      for (const key of entries.keys()) if (inUse(key)) ensure(key);
    });
  }

  return {
    get: (key) => entries.get(key)?.state ?? EMPTY_STATE,
    subscribe(key, listener) {
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0 && listeners.get(key) === set) listeners.delete(key);
      };
    },
    subscribeAll(listener) {
      allListeners.add(listener);
      return () => void allListeners.delete(listener);
    },
    version: () => version,
    retain(key) {
      users.set(key, (users.get(key) ?? 0) + 1);
      ensure(key);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const left = (users.get(key) ?? 1) - 1;
        if (left > 0) users.set(key, left);
        else users.delete(key);
      };
    },
    ensure,
    reload(key) {
      const entry = entryOf(key);
      if (!load) return Promise.resolve(entry.state.data as T);
      const promise = new Promise<T>((resolve, reject) => entry.waiters.push({ resolve, reject }));
      // 待たない呼び方（void store.reload()）でも、失敗を「拾われていない」と言わせない（待つ側には失敗が届く）
      promise.catch(() => {});
      restart(key, entry);
      return promise;
    },
    set(key, value) {
      const entry = entryOf(key);
      entry.request++;
      entry.replay = null;
      entry.again = false;
      entry.stale = false;
      entry.loadedAt = Date.now();
      change(key, entry, { data: value, error: undefined, loading: false });
      settle(entry, { data: value });
    },
    update,
    invalidate(key) {
      const entry = entries.get(key);
      if (!entry) return;
      entry.stale = true;
      if (inUse(key)) restart(key, entry);
    },
    drop,
  };
}
