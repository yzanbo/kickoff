// useQuery の中の様子と、その移り方（純粋。React を描かずにテストする）

/** 取得の様子（key は届いた値・失敗がどのキーのものか。fetching は取りに行っているキー） */
export interface QueryState<T> {
  readonly key: string | null;
  readonly data: T | undefined;
  readonly error: Error | undefined;
  /** key の結果（成功か失敗）が届いた */
  readonly loaded: boolean;
  readonly fetching: string | null;
}

export const EMPTY_QUERY: QueryState<never> = Object.freeze({ key: null, data: undefined, error: undefined, loaded: false, fetching: null });

/** 取りに行き始めた */
export const startFetch = <T>(state: QueryState<T>, key: string): QueryState<T> => (state.fetching === key ? state : { ...state, fetching: key });

/** 値が届いた（同じキーで same が同じと言えば、前の値のまま。中身が同じなら描き直さない） */
export function settleData<T>(state: QueryState<T>, key: string, data: T, same?: (prev: T, next: T) => boolean): QueryState<T> {
  const fetching = state.fetching === key ? null : state.fetching;
  if (state.key === key && state.data !== undefined && state.error === undefined && same?.(state.data, data)) {
    return state.loaded && state.fetching === fetching ? state : { ...state, loaded: true, fetching };
  }
  return { key, data, error: undefined, loaded: true, fetching };
}

/** 失敗した（keepPrevious なら前の値を残す。そうでなければ、このキーの値は捨てる） */
export function settleError<T>(state: QueryState<T>, key: string, error: Error, keepPrevious: boolean): QueryState<T> {
  return { key, data: keepPrevious ? state.data : undefined, error, loaded: true, fetching: state.fetching === key ? null : state.fetching };
}

/** 部品に見せる値（いまのキーのものだけ。keepPrevious なら、前のキーの値と失敗を出したまま） */
export function queryView<T>(state: QueryState<T>, key: string | null, { enabled, keepPrevious }: { enabled: boolean; keepPrevious: boolean }) {
  const current = key !== null && state.key === key;
  const shown = current || keepPrevious;
  return {
    data: shown ? state.data : undefined,
    error: shown ? state.error : undefined,
    loading: enabled && key !== null && (state.fetching === key || !(current && state.loaded)),
    loaded: current && state.loaded,
    stale: !current && keepPrevious && state.data !== undefined,
  };
}

/** 届いている値を書き換える（関数なら前の値から。いまのキーの値がなければ何もしない。値ならいまのキーの値として入れる） */
export function replaceData<T>(state: QueryState<T>, key: string | null, next: T | ((prev: T) => T)): QueryState<T> {
  if (key === null) return state;
  if (typeof next !== "function") return { ...state, key, data: next, error: undefined, loaded: true };
  if (state.key !== key || state.data === undefined) return state;
  return { ...state, data: (next as (prev: T) => T)(state.data) };
}

/** 失敗を Error にする（ApiError はそのまま。code で分けられる） */
export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));
