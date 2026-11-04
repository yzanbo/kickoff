// key（プロジェクトの ID など）ごとに値を持つ店の仕組み（値を 1 つだけ持つ店 createStore も、これを 1 つの key で使う）。
// 店の考え方（読み込み・失敗・知らせ・つながったとき）は createStore.ts の先頭に、形（様子・指定・できること）は storeTypes.ts に書く
import { errorMessage } from "@shared/errors";
import { subscribeServerEvent, subscribeServerOpen } from "@/api/events";
import { EMPTY_STATE, type KeyedStore, type KeyedStoreOptions, type StoreState } from "./storeTypes";

/** 失敗したあと、使っている値を自動で取り直すまでの間隔（続けて失敗するたびに倍にし、上限で止める） */
const RETRY_FIRST_MS = 2_000;
const RETRY_MAX_MS = 60_000;
const retryDelay = (failures: number) => Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** (failures - 1));

interface Entry<T> {
  state: StoreState<T>;
  /** 最後に値が届いた時刻 */
  loadedAt: number;
  /** 次に使うときに取り直す（失敗した・古いと知らされた・つながった） */
  stale: boolean;
  /** いまの読み込みの番号（新しい読み込み・set で進む。番号の違う応答は捨てる） */
  request: number;
  /** 読み込み中に当てた変更（知らせ・update）。届いた値にもう一度当てる。読み込み中でなければ null */
  replay: ((data: T) => T)[] | null;
  /** 読み込み中に取り直しを頼まれた（終わったらもう一度読む） */
  again: boolean;
  /** 続けて失敗した数と、それまでは使い始めても取り直さない時刻・自動の取り直しの時計 */
  failures: number;
  retryAt: number;
  retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** reload を待っているもの */
  waiters: { resolve: (data: T) => void; reject: (error: unknown) => void }[];
}

export function createKeyedStore<K extends string | number, T>(options: KeyedStoreOptions<K, T> = {}): KeyedStore<K, T> {
  const { load, reduce, reloadOn, dropOn, maxAge, refreshOnFocus } = options;
  const entries = new Map<K, Entry<T>>();
  const listeners = new Map<K, Set<() => void>>();
  // 使っている部品の数（key ごと。値を捨てて作り直しても数は残す）
  const users = new Map<K, number>();

  const inUse = (key: K) => (users.get(key) ?? 0) > 0;

  function notify(key: K) {
    for (const listener of [...(listeners.get(key) ?? [])]) listener();
  }

  function entryOf(key: K): Entry<T> {
    let entry = entries.get(key);
    if (!entry) {
      entry = { state: EMPTY_STATE, loadedAt: 0, stale: false, request: 0, replay: null, again: false, failures: 0, retryAt: 0, retryTimer: undefined, waiters: [] };
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

  function stopRetry(entry: Entry<T>) {
    clearTimeout(entry.retryTimer);
    entry.retryTimer = undefined;
  }

  /** 失敗を覚えずに、しばらくしてから取り直す（使っていれば。使っていなければ、次に使うときに） */
  function scheduleRetry(key: K, entry: Entry<T>) {
    entry.failures++;
    const delay = retryDelay(entry.failures);
    entry.retryAt = Date.now() + delay;
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = undefined;
      if (entries.get(key) === entry && entry.stale && inUse(key) && !entry.state.loading) start(key, entry);
    }, delay);
    // テスト（Node）では、待っている取り直しのためにプロセスを残さない
    (entry.retryTimer as { unref?: () => void }).unref?.();
  }

  function start(key: K, entry: Entry<T>) {
    if (!load) return;
    const request = ++entry.request;
    stopRetry(entry);
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
        entry.failures = 0;
        entry.retryAt = 0;
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
        // 失敗は覚えない（前に届いた値は出したまま、しばらくしてから・つながったときに取り直す）
        entry.stale = true;
        scheduleRetry(key, entry);
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
    if (!entry.state.loading && !fresh(entry) && Date.now() >= entry.retryAt) start(key, entry);
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
    stopRetry(entry);
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

  // つながったら、失敗した値と、知らせで直している値を取り直す（つながる前・切れている間に頼んだ値は、その間の知らせを取りこぼしている。
  // つながったあとに頼んだ値は、サーバーが知らせを送り始めてから作るので取りこぼさない）
  const followsEvents = Boolean(reduce || reloadOn);
  subscribeServerOpen(() => {
    for (const [key, entry] of entries) {
      if (followsEvents) entry.stale = true;
      if (entry.stale && inUse(key)) restart(key, entry);
    }
  });

  if (refreshOnFocus && typeof window !== "undefined") {
    window.addEventListener("focus", () => {
      for (const key of entries.keys()) if (inUse(key)) ensure(key);
    });
  }

  return {
    loads: Boolean(load),
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
      stopRetry(entry);
      Object.assign(entry, { replay: null, again: false, stale: false, failures: 0, retryAt: 0, loadedAt: Date.now() });
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
