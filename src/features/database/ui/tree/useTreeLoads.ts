// DB の木の段の読み込み: 開いた段だけを段のキーごとに 1 回読み、描いた木で使わなくなった段は捨てる（閉じて開き直すと読み直す）
import { useEffect, useEffectEvent, useRef, useState } from "react";

/** 1 つの段の読み込み（失敗は ApiError のまま。code で分ける） */
export interface TreeLoad<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  /** 読み直す（失敗の行の「つなぎ直す」など） */
  reload(): void;
}

/** 段を読む口（key が同じなら同じ読み込みを使う。キーには読み方を変える値をすべて入れる） */
export type TreeGet = <T>(key: string, load: () => Promise<T>) => TreeLoad<T>;

interface Entry {
  data?: unknown;
  error?: unknown;
  loading: boolean;
  /** 何番目の読み込みか（読み直した・捨てたあとに届いた古い応答は捨てる） */
  seq: number;
}

/** build に段を読む口を渡して木を組む。build の中で get した段のうち、まだ読んでいないものを描いたあとに読み始める */
export function useTreeLoads<R>(build: (get: TreeGet) => R): R {
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(() => new Map());
  const seq = useRef(0);
  const start = (key: string, load: () => Promise<unknown>) => {
    const id = ++seq.current;
    const settle = (result: { data: unknown } | { error: unknown }) =>
      setEntries((m) => (m.get(key)?.seq === id ? new Map(m).set(key, { ...result, loading: false, seq: id }) : m));
    setEntries((m) => new Map(m).set(key, { data: m.get(key)?.data, loading: true, seq: id }));
    load().then(
      (data) => settle({ data }),
      (error: unknown) => settle({ error }),
    );
  };
  const wanted = new Map<string, () => Promise<unknown>>();
  const get: TreeGet = <T>(key: string, load: () => Promise<T>) => {
    wanted.set(key, load);
    const e = entries.get(key);
    return { data: e?.data as T | undefined, error: e?.error, loading: e?.loading ?? true, reload: () => start(key, load) };
  };
  const result = build(get);
  const wantedKeys = [...wanted.keys()].join("\n");
  const sync = useEffectEvent(() => {
    for (const [key, load] of wanted) if (!entries.has(key)) start(key, load);
    if ([...entries.keys()].some((key) => !wanted.has(key))) setEntries((m) => new Map([...m].filter(([key]) => wanted.has(key))));
  });
  useEffect(() => sync(), [wantedKeys]);
  return result;
}
