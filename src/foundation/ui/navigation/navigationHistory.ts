import { href, lastingRoute, type Route } from "./router";

/** ウィンドウを開いている間に覚える、画面の移動の数 */
const MAX_HISTORY = 50;

interface NavigationHistoryState {
  readonly entries: readonly Route[];
  readonly index: number;
}

/**
 * Kickoff の画面の履歴。開くファイル・ノート・発言の強調は一度きりの指定なので、画面単位で覚える。
 * パネルの開閉・編集操作・内蔵ブラウザのページ移動はここには入れない
 */
export function createNavigationHistory(initialRoute: Route) {
  let state: NavigationHistoryState = { entries: [lastingRoute(initialRoute)], index: 0 };
  const listeners = new Set<() => void>();
  const update = (next: NavigationHistoryState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    record(route: Route, replace = false) {
      const entry = lastingRoute(route);
      if (href(state.entries[state.index]) === href(entry)) return;
      if (replace) {
        const entries = [...state.entries];
        entries[state.index] = entry;
        update({ entries, index: state.index });
      } else {
        const entries = [...state.entries.slice(0, state.index + 1), entry].slice(-MAX_HISTORY);
        update({ entries, index: entries.length - 1 });
      }
    },
    move(step: -1 | 1): Route | undefined {
      const index = state.index + step;
      const route = state.entries[index];
      if (!route) return undefined;
      update({ ...state, index });
      return route;
    },
  };
}
