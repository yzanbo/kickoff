// タブごとのオン / オフの印（SQL のタブの「コミットしていない」・テーブルのタブの「保存していない」）。
// タブの列の印と、タブの中身・閉じるときの確かめで共通に読む。画面の中だけ（ウィンドウを閉じれば消える）
import { useSyncExternalStore } from "react";

export interface TabFlags {
  /** 印を付ける / 外す（変わったときだけ知らせる） */
  set: (key: string, on: boolean) => void;
  has: (key: string) => boolean;
  useFlag: (key: string) => boolean;
}

export function createTabFlags(): TabFlags {
  const on = new Set<string>();
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
  };
  return {
    set: (key, value) => {
      if (on.has(key) === value) return;
      if (value) on.add(key);
      else on.delete(key);
      for (const l of listeners) l();
    },
    has: (key) => on.has(key),
    useFlag: (key) => useSyncExternalStore(subscribe, () => on.has(key)),
  };
}

/** テーブルのタブに保存していない変更があるか（キーは「置き場所:タブのキー」。同じテーブルを別の置き場所で開いても分ける） */
export const unsavedTables = createTabFlags();

/** テーブルのタブの印のキー */
export const unsavedKey = (place: string, tabKey: string) => `${place}:${tabKey}`;
