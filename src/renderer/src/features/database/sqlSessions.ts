// SQL のタブごとの、トランザクションの途中か（タブの列の「コミットしていない」印と、SQL のタブの帯で共通に読む）。画面の中だけ（ウィンドウを閉じれば消える。DB 側は閉じたら取り消す）
import { useSyncExternalStore } from "react";

const pending = new Set<string>();
const listeners = new Set<() => void>();

/** そのタブがトランザクションの途中かを覚える（変わったときだけ知らせる） */
export function setSqlPending(key: string, inTransaction: boolean) {
  if (pending.has(key) === inTransaction) return;
  if (inTransaction) pending.add(key);
  else pending.delete(key);
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** そのタブがトランザクションの途中か */
export function useSqlPending(key: string): boolean {
  return useSyncExternalStore(subscribe, () => pending.has(key));
}
