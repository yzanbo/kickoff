import { agentStateOf, boardColumnOf } from "../../../../core/board";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import type { AgentState, Approval, BoardColumn, Run } from "../../../../core/types";

/** チャットの並べ方（ChatGroupingMenu の CHAT_GROUPINGS。どのプロジェクトでも同じ） */
export const GROUPING_KEY = "kickoff:sidebar-grouping";
/** 自分待ち（回答待ち・確認待ち）のチャットだけを出すか（"1" なら出す。上の行の「自分待ち」で切り替える） */
export const WAITING_ONLY_KEY = "kickoff:sidebar-waiting-only";
/** チャットを 1 行で出すか（"1" なら 2 行目のセクション・ブランチを隠す。並べ方のメニューで切り替える） */
export const COMPACT_KEY = "kickoff:sidebar-compact";
/** アーカイブ済みのチャットを一覧の下に出すか（どのプロジェクトでも同じ。はじめは出さない） */
export const SHOW_ARCHIVED_KEY = "kickoff:sidebar-show-archived";

/** 自分が見る番か（カンバンの回答待ち・確認待ちの列と同じ） */
export const isWaitingState = (state: AgentState) => {
  const column = boardColumnOf(state);
  return column === "needs_input" || column === "review";
};

/** 自分待ちのチャット（アーカイブしたものは除く） */
export const waitingRuns = (runs: Run[], approvals: Approval[]) =>
  runs.filter((r) => !r.archived_at && isWaitingState(agentStateOf(r, approvals.some((a) => a.run_id === r.id))));

/** サイドバーのプロジェクトに出す状態ごとのチャット数（作業中・回答待ち・確認待ち。アーカイブしたものは数えない） */
export type StateCounts = Record<Exclude<BoardColumn, "done">, number>;

export function stateCounts(runs: Run[], approvals: Approval[]): StateCounts {
  const counts: StateCounts = { running: 0, needs_input: 0, review: 0 };
  for (const r of runs) {
    if (r.archived_at) continue;
    const column = boardColumnOf(agentStateOf(r, approvals.some((a) => a.run_id === r.id)));
    if (column !== "done") counts[column]++;
  }
  return counts;
}

/** 並べ方でまとめたまとまり（状態・作業場所・セクション）ごとの、閉じているか（GroupedChatRows） */
export const SECTION_CLOSED_PREFIX = "kickoff:sidebar-group-closed:";

const FOLD_ALL_EVENT = "kickoff:sidebar-fold-all";

/**
 * 見出しの行の「すべて閉じる / 開く」: プロジェクトだけでなく、中のまとまり（グループ・グループなし・固定・アーカイブ済み・並べ方のまとまり）もすべて開閉する。
 * 描かれている部品には知らせ（useFoldAll）で伝え、開くときは、描かれていないまとまり（閉じたプロジェクトの中など）の覚えている値も開いたにする
 */
export function foldAll(collapsed: boolean) {
  if (!collapsed) {
    for (const key of Object.keys(localStorage)) if (key.startsWith(SECTION_CLOSED_PREFIX)) localStorage.setItem(key, "0");
  }
  window.dispatchEvent(new CustomEvent<boolean>(FOLD_ALL_EVENT, { detail: collapsed }));
}

/** 「すべて閉じる / 開く」を受け取る（collapsed: 閉じるなら true） */
export function useFoldAll(handler: (collapsed: boolean) => void) {
  useWindowEvent(FOLD_ALL_EVENT, (e) => handler((e as CustomEvent<boolean>).detail));
}
