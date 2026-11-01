import { useState } from "react";

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
