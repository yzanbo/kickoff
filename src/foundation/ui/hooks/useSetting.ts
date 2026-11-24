import { useState, useSyncExternalStore } from "react";
import { readSetting, subscribeSetting, writeSetting, type Setting } from "@/foundation/ui/storage";

/**
 * 保存する表示の設定（機能の ui/storage.ts で宣言したもの）を読み書きする。同じ設定を読む部品どうしで値がそろい
 * （分割したペインの 2 つのチャットなど）、React の外で書き換えても描き直す。set は参照が変わらない（memo した部品に渡せる）
 */
export function useSetting<T>(setting: Setting<T>): readonly [T, (value: T) => void] {
  const subscribe = (listener: () => void) => subscribeSetting(setting, listener);
  const value = useSyncExternalStore(subscribe, () => readSetting(setting));
  const set = (next: T) => writeSetting(setting, next);
  return [value, set];
}

const noSubscribe = () => () => {};

/** setting がなければ保存せず、部品の中だけで持つ（保存しない入力欄など。あれば useSetting と同じ） */
export function useOptionalSetting<T>(setting: Setting<T> | undefined, initial: T): readonly [T, (value: T) => void] {
  const [local, setLocal] = useState(initial);
  const subscribe = (listener: () => void) => (setting ? subscribeSetting(setting, listener) : noSubscribe());
  const value = useSyncExternalStore(subscribe, () => (setting ? readSetting(setting) : local));
  const set = (next: T) => (setting ? writeSetting(setting, next) : setLocal(next));
  return [value, set];
}
