import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { onServerOpen, useServerEvent, type AnyServerEvent, type ServerEvent, type ServerEventType } from "@/foundation/ui/api/events";
import { EMPTY_QUERY, queryView, replaceData, seedData, settleData, settleError, startFetch, toError, type QueryState } from "./queryState";

export type QueryKey = string | readonly (string | number | boolean | null | undefined)[];

export interface QueryOptions<T> {
  /** false の間は取りに行かない（届いた値は残す。表示していないタブ・閉じたポップオーバー）。既定 true */
  enabled?: boolean;
  /** キーが同じまま取り直すきっかけ（変わったら、前の値を出したまま取り直す。変更の一覧の version など。JSON にできる値） */
  deps?: readonly unknown[];
  /** 届いたら取り直す SSE の種類（関数なら当てはまるときだけ） */
  refetchOn?: { readonly [E in ServerEventType]?: true | ((event: ServerEvent<E>) => boolean) };
  /** この間隔（ms）で取り直す。窓が見えている間だけ（document.hidden の間は止める）。関数なら届いている値から決める */
  interval?: number | ((data: T | undefined) => number | undefined);
  /** interval の取り直しを、窓がほかのアプリの後ろにある間も止める（前に戻ったら数え直す。既定 false） */
  pauseWhenBlurred?: boolean;
  /** 窓に戻ったら取り直す（既定 false） */
  refetchOnFocus?: boolean;
  /** SSE がつながったら取り直す（既定: refetchOn があれば true、なければ false） */
  refetchOnOpen?: boolean;
  /** キーが変わったとき・失敗したとき、前の値を出したままにする（既定 false = キーが変わったら読み込み中に戻る） */
  keepPrevious?: boolean;
  /** 取り直した結果が前と同じなら前の値のまま（中身が同じなら描き直さない） */
  same?: (prev: T, next: T) => boolean;
  /** このキーの値がまだないとき、答えが届くまでのつなぎの値（コアが覚えた中身など。null なら出さない。失敗は見ない） */
  seed?: (signal: AbortSignal) => Promise<T | null>;
  /** 取りに行く前に待つ時間（ms。入力中のフォルダの点検など。待つ間も読み込み中で、その間にキーが変われば取りに行かない） */
  delay?: number;
  /**
   * 取り直しが重なったとき。既定は前の頼みを捨てて取り直す。"trailing" は前の頼みを待ち、その間のきっかけは
   * 終わってから 1 回にまとめて取り直す（頼むたびにコアが動くもの。reload() はまとめた 1 回が終わるまで待つ）
   */
  dedupe?: "trailing";
}

export interface QueryResult<T> {
  data: T | undefined;
  /** 最後の失敗（ApiError のまま。code で分けられる）。成功したら消える */
  error: Error | undefined;
  /** いまのキーで取りに行っている（まだ結果が届いていないときも） */
  loading: boolean;
  /** いまのキーの結果（成功か失敗）が届いた */
  loaded: boolean;
  /** 前のキーの値を出している（keepPrevious のとき） */
  stale: boolean;
  /** 同じキーで取り直す（終わるまで待てる。失敗は error に入り、投げない） */
  reload(): Promise<void>;
  /** 届いている値を書き換える（関数ならいまのキーの値から。キーが変わっていれば何もしない。値ならそのまま入れる） */
  setData(next: T | ((prev: T) => T)): void;
}

/**
 * 1 つの部品だけが読み、SSE では取り直すだけの値を取る（2 か所以上が読む・SSE で直す値は店 createStore）。
 * key が null なら取りに行かない。古いキー・古い取り直しの応答は捨てる（取り下げたら signal を abort する）
 */
export function useQuery<T>(key: QueryKey | null, load: (signal: AbortSignal) => Promise<T>, options: QueryOptions<T> = {}): QueryResult<T> {
  const { enabled = true, deps = [], refetchOn, interval, pauseWhenBlurred = false, refetchOnFocus = false, keepPrevious = false, delay = 0, dedupe } = options;
  const keyText = key === null ? null : JSON.stringify(key);
  const depsText = JSON.stringify(deps);
  const [state, setState] = useState<QueryState<T>>(EMPTY_QUERY);
  const [nonce, setNonce] = useState(0);
  const latestState = useLatest(state);
  // reload() を待っている呼び手（次に結果が届いたら返す）
  const waiters = useRef<(() => void)[]>([]);
  // dedupe: "trailing" の、取りに行っている最中か・その間に取り直しを頼まれたか
  const inFlight = useRef(false);
  const queued = useRef(false);
  // 取り直すきっかけは key・enabled・deps・reload だけ（load と same は描くたびに作られるので、依存に入れず最新のものを使う）
  const startLoad = useEffectEvent((signal: AbortSignal) => load(signal));
  const startSeed = useEffectEvent((signal: AbortSignal) => options.seed?.(signal));
  const currentSame = useEffectEvent(() => options.same);
  const live = keyText !== null && enabled;

  useEffect(() => {
    if (keyText === null || !enabled) return;
    const controller = new AbortController();
    const done = (next: (s: QueryState<T>) => QueryState<T>) => {
      if (controller.signal.aborted) return;
      setState(next);
      inFlight.current = false;
      // 最中に頼まれた取り直しは、ここでまとめて 1 回（待っている reload() はその 1 回の結果で返す）
      if (queued.current) {
        queued.current = false;
        setNonce((n) => n + 1);
        return;
      }
      for (const resolve of waiters.current.splice(0)) resolve();
    };
    inFlight.current = true;
    queued.current = false;
    setState((s) => startFetch(s, keyText));
    // つなぎの値は、ほかのキーから移ってきたときだけ聞く（同じキーの取り直しでは聞かない）
    if (latestState.current.key !== keyText)
      startSeed(controller.signal)?.then(
        (data) => data != null && !controller.signal.aborted && setState((s) => seedData(s, keyText, data)),
        () => undefined,
      );
    const fetchNow = () =>
      startLoad(controller.signal).then(
        (data) => {
          // setState に渡す更新の関数は描く中で呼ばれることがあるので、effect event はその外で呼んで比べ方を取り出しておく
          const same = currentSame();
          done((s) => settleData(s, keyText, data, same));
        },
        (e: unknown) => done((s) => settleError(s, keyText, toError(e), keepPrevious)),
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (delay > 0) timer = setTimeout(fetchNow, delay);
    else void fetchNow();
    return () => {
      clearTimeout(timer);
      controller.abort();
      inFlight.current = false;
    };
  }, [keyText, enabled, nonce, depsText, keepPrevious, delay]);

  const refetch = () => {
    if (dedupe === "trailing" && inFlight.current) queued.current = true;
    else setNonce((n) => n + 1);
  };
  const onEvent = useEffectEvent((event: AnyServerEvent) => {
    const when = refetchOn?.[event.type] as true | ((e: AnyServerEvent) => boolean) | undefined;
    if (live && (when === true || (when !== undefined && when(event)))) refetch();
  });
  useServerEvent(Object.keys(refetchOn ?? {}) as ServerEventType[], onEvent);

  const onOpen = useEffectEvent(() => live && refetch());
  const refetchOnOpen = options.refetchOnOpen ?? Object.keys(refetchOn ?? {}).length > 0;
  useEffect(() => (refetchOnOpen ? onServerOpen(onOpen) : undefined), [refetchOnOpen]);

  useEffect(() => {
    if (!live || !refetchOnFocus) return;
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [live, refetchOnFocus]);

  const view = queryView(state, keyText, { enabled, keepPrevious });
  const every = typeof interval === "function" ? interval(view.data) : interval;
  useEffect(() => {
    if (!live || !every) return;
    if (!pauseWhenBlurred) {
      const timer = setInterval(() => document.hidden || refetch(), every);
      return () => clearInterval(timer);
    }
    // 窓が前にある間だけ数える（前に戻ったら初めから）
    let timer: ReturnType<typeof setInterval> | undefined;
    const restart = () => {
      clearInterval(timer);
      timer = document.hasFocus() ? setInterval(refetch, every) : undefined;
    };
    restart();
    window.addEventListener("focus", restart);
    window.addEventListener("blur", restart);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", restart);
      window.removeEventListener("blur", restart);
    };
  }, [live, every, pauseWhenBlurred]);

  return {
    ...view,
    reload: () =>
      live
        ? new Promise<void>((resolve) => {
            waiters.current.push(resolve);
            refetch();
          })
        : Promise.resolve(),
    setData: (next) => setState((s) => replaceData(s, keyText, next)),
  };
}
