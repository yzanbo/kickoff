// タブごとのオン / オフの印（SQL のタブの「コミットしていない」・テーブルのタブの「保存していない」）。
// タブの列の印と、タブの中身・閉じるときの確かめで共通に読む。画面の中だけ（ウィンドウを閉じれば消える）
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { useKeyedStore } from "@/foundation/ui/store/useStore";

export interface TabFlags {
  /** 印を付ける / 外す（変わったときだけ知らせる） */
  set: (key: string, on: boolean) => void;
  has: (key: string) => boolean;
  useFlag: (key: string) => boolean;
}

/** 読み込まない店（createKeyedStore）に、付いている印だけを持つ */
export function createTabFlags(): TabFlags {
  const flags = createKeyedStore<string, true>();
  const has = (key: string) => flags.get(key).data === true;
  return {
    set: (key, on) => {
      if (has(key) === on) return;
      if (on) flags.set(key, true);
      else flags.drop(key);
    },
    has,
    useFlag: (key) => useKeyedStore(flags, key).data === true,
  };
}

/** テーブルのタブに保存していない変更があるか（キーは「置き場所:タブのキー」。同じテーブルを別の置き場所で開いても分ける） */
export const unsavedTables = createTabFlags();

/** テーブルのタブの印のキー */
export const unsavedKey = (surfaceKey: string, tabKey: string) => `${surfaceKey}:${tabKey}`;
