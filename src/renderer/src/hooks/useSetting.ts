import { useCallback, useState, useSyncExternalStore } from "react";
import { familyVersion, readSetting, subscribeFamily, subscribeSetting, writeSetting, type Setting, type SettingFamily } from "@/lib/storage";

/**
 * 保存する表示の設定（lib/storageKeys.ts で宣言したもの）を読み書きする。同じ設定を読む部品どうしで値がそろい
 * （分割したペインの 2 つのチャットなど）、React の外で書き換えても描き直す。set は参照が変わらない（memo した部品に渡せる）
 */
export function useSetting<T>(setting: Setting<T>): readonly [T, (value: T) => void] {
  const subscribe = useCallback((listener: () => void) => subscribeSetting(setting, listener), [setting]);
  const value = useSyncExternalStore(subscribe, () => readSetting(setting));
  const set = useCallback((next: T) => writeSetting(setting, next), [setting]);
  return [value, set];
}

const noSubscribe = () => () => {};

/** setting がなければ保存せず、部品の中だけで持つ（保存しない入力欄など。あれば useSetting と同じ） */
export function useOptionalSetting<T>(setting: Setting<T> | undefined, initial: T): readonly [T, (value: T) => void] {
  const [local, setLocal] = useState(initial);
  const subscribe = useCallback((listener: () => void) => (setting ? subscribeSetting(setting, listener) : noSubscribe()), [setting]);
  const value = useSyncExternalStore(subscribe, () => (setting ? readSetting(setting) : local));
  const set = useCallback((next: T) => (setting ? writeSetting(setting, next) : setLocal(next)), [setting]);
  return [value, set];
}

/**
 * ID ごとの設定（グループごとの開閉など）。ID はあとから増えるので、get は描くときにその ID の値を読む（どの ID を書き換えても描き直す）。
 * set は参照が変わらない（memo した部品に渡せる）
 */
export function useSettingFamily<T>(family: SettingFamily<T>) {
  const subscribe = useCallback((listener: () => void) => subscribeFamily(family as SettingFamily<unknown>, listener), [family]);
  useSyncExternalStore(subscribe, () => familyVersion(family as SettingFamily<unknown>));
  const set = useCallback((id: string | number, value: T) => writeSetting(family(id), value), [family]);
  return { get: (id: string | number): T => readSetting(family(id)), set };
}
