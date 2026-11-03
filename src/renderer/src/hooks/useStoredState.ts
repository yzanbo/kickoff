import { useCallback, useState, useSyncExternalStore } from "react";

/**
 * localStorage に保存する状態（開閉・表示の切り替えなど）。
 * 保存の形式（"1" / "0" など）は今までのものを変えないよう、読み書きの方法を渡す。
 * key が変わったら（チャット・プロジェクトごとの状態など）、その key の値を読み直す
 */
export function useStoredState<T>(key: string, decode: (raw: string | null) => T, encode: (value: T) => string) {
  const [state, setState] = useState(() => ({ key, value: decode(localStorage.getItem(key)) }));
  const value = state.key === key ? state.value : decode(localStorage.getItem(key));
  const set = (next: T) => {
    localStorage.setItem(key, encode(next));
    setState({ key, value: next });
  };
  return [value, set] as const;
}

/**
 * 書きかけの文（チャットごとの入力欄の下書きなど）。空にしたら消す（空の値を残さない）。
 * key がなければ保存せず、ふつうの状態として持つ
 */
export function useStoredText(key: string | undefined) {
  const read = (k: string | undefined) => (k ? (localStorage.getItem(k) ?? "") : "");
  const [state, setState] = useState(() => ({ key, value: read(key) }));
  const value = state.key === key ? state.value : read(key);
  const set = useCallback(
    (next: string) => {
      if (key) {
        if (next) localStorage.setItem(key, next);
        else localStorage.removeItem(key);
      }
      setState({ key, value: next });
    },
    [key],
  );
  return [value, set] as const;
}

/** "1" / "0" で保存するオン・オフ */
export function useStoredFlag(key: string, initial = false) {
  return useStoredState(
    key,
    (raw) => (raw === null ? initial : raw === "1"),
    (on) => (on ? "1" : "0"),
  );
}

/** 決まった文字列のどれか（知らない値・未保存なら initial） */
export function useStoredChoice<T extends string>(key: string, choices: readonly T[], initial: T) {
  return useStoredState(
    key,
    (raw) => (choices.includes(raw as T) ? (raw as T) : initial),
    (value) => value,
  );
}

/** 数（未保存・0・数でない値なら initial） */
export function useStoredNumber(key: string, initial: number) {
  return useStoredState(
    key,
    (raw) => Number(raw) || initial,
    (value) => String(value),
  );
}

/**
 * id ごとの "1" / "0"（グループごとの開閉など）。id はあとから増えるので、その都度保存された値を読む
 */
export function useStoredFlagMap(prefix: string) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const get = (id: number | string) => overrides[id] ?? localStorage.getItem(`${prefix}${id}`) === "1";
  // 参照が変わらないので、memo した部品にそのまま渡せる
  const set = useCallback(
    (id: number | string, on: boolean) => {
      localStorage.setItem(`${prefix}${id}`, on ? "1" : "0");
      setOverrides((prev) => ({ ...prev, [id]: on }));
    },
    [prefix],
  );
  const toggle = (id: number | string) => set(id, !get(id));
  return { get, set, toggle };
}

const sharedListeners = new Set<() => void>();
const subscribeShared = (listener: () => void) => {
  sharedListeners.add(listener);
  return () => void sharedListeners.delete(listener);
};

/**
 * 同じ key を使うすべての部品でそろう、localStorage に保存する状態（サイドバーの各プロジェクトのメニュー・右クリックのメニューなど、
 * 別々の部品から切り替えるもの）。useStoredState は部品ごとに値を持つので、ほかの部品で切り替えても変わらない。
 * encode は参照の変わらない関数を渡す（set の参照が変わらないように）
 */
function useSharedState<T>(key: string, decode: (raw: string | null) => T, encode: (value: T) => string) {
  const raw = useSyncExternalStore(subscribeShared, () => localStorage.getItem(key));
  const set = useCallback(
    (next: T) => {
      localStorage.setItem(key, encode(next));
      sharedListeners.forEach((l) => l());
    },
    [key, encode],
  );
  return [decode(raw), set] as const;
}

const encodeFlag = (on: boolean) => (on ? "1" : "0");
const encodeChoice = (value: string) => value;

/** 部品どうしでそろう "1" / "0" */
export function useSharedFlag(key: string, initial = false) {
  return useSharedState(key, (raw) => (raw === null ? initial : raw === "1"), encodeFlag);
}

/** 部品どうしでそろう、決まった文字列のどれか（知らない値・未保存なら initial） */
export function useSharedChoice<T extends string>(key: string, choices: readonly T[], initial: T) {
  return useSharedState<T>(key, (raw) => (choices.includes(raw as T) ? (raw as T) : initial), encodeChoice);
}

/** 文字列の配列を JSON で読む（壊れた値・文字でない要素は捨てる）。同じ文字列なら同じ配列を返す（useMemo などの依存が毎回変わらないように） */
const listCache = new Map<string, string[]>();
const decodeList = (raw: string | null): string[] => {
  if (!raw) return [];
  let list = listCache.get(raw);
  if (!list) {
    try {
      const value: unknown = JSON.parse(raw);
      list = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
    } catch {
      list = [];
    }
    listCache.set(raw, list);
  }
  return list;
};
const encodeList = (value: string[]) => JSON.stringify(value);

/** 部品どうしでそろう、文字列の配列（JSON で保存。未保存なら空） */
export function useSharedList(key: string) {
  return useSharedState<string[]>(key, decodeList, encodeList);
}
