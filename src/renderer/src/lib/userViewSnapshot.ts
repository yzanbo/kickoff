// 送る指示に添える「送った時点の画面の様子」（AI の get_user_view。メモの仕様書「0019_AI の操作ツールの追加」の D）。
// 様子を集めるのは画面全体（app/userViewReport.ts）なので、API の関数からはここを通して読む（api は app・features を import しない）
import type { UserView } from "@shared/types";

let provider: (() => UserView | null) | null = null;

/** いまの様子を集める関数を置く（App が 1 つ置く。返した関数で外す） */
export function setUserViewProvider(fn: () => UserView | null): () => void {
  provider = fn;
  return () => {
    if (provider === fn) provider = null;
  };
}

/** 送る本文に足す項目（集められなければ何も足さない。集めるのに失敗しても送るのは止めない） */
export function withUserView(): { user_view?: UserView } {
  try {
    const view = provider?.() ?? null;
    return view ? { user_view: view } : {};
  } catch {
    return {};
  }
}
