// 店（createStore.ts）を React から読む hooks。描いている間はその値を購読し、使っている間は読み込みを頼む（retain）
import { useEffect, useSyncExternalStore } from "react";
import type { Store } from "./createStore";

interface UseOptions {
  /** false の間は読み込みを頼まない（届いている値は読める。閉じているポップオーバーなど）。初めは true */
  active?: boolean;
}

/**
 * 値を読まずに、読み込みの様子（届いたか・読み込み中か・失敗の文）だけを読む。
 * 値が変わっても、様子が変わらなければ描き直さない（値は別の選び方で読む部品のため。チャットの一覧など）
 */
export function useStoreStatus<T>(store: Store<T>, { active = true }: UseOptions = {}): { loaded: boolean; loading: boolean; error: string | undefined } {
  useEffect(() => (active ? store.retain() : undefined), [store, active]);
  const loaded = useSyncExternalStore(store.subscribe, () => store.get().loaded);
  const loading = useSyncExternalStore(store.subscribe, () => store.get().loading);
  const error = useSyncExternalStore(store.subscribe, () => store.get().error);
  return { loaded, loading, error };
}
