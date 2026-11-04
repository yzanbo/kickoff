import { boardColumnOf } from "@shared/chat/state";
import { useSharedFlag } from "@/hooks/useStoredState";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { runStateOf, type ApprovalIndex } from "@/features/chat/chatState";
import { SIDEBAR_COMPACT_KEY, SIDEBAR_PROJECT_COMPACT_KEY, SIDEBAR_SECTION_CLOSED_PREFIX, SIDEBAR_SHOW_ARCHIVED_KEY } from "@/lib/storageKeys";
import type { AgentState, Run } from "@shared/types";

/** チャットを 1 行で出すか（初めは 1 行。どの部品でも同じ初期値になるよう、ここから読む） */
export const useCompactRows = () => useSharedFlag(SIDEBAR_COMPACT_KEY, true);
/** プロジェクトのカードを 1 行で出すか（初めは 2 行。チャットの行とは別に切り替える） */
export const useCompactProjects = () => useSharedFlag(SIDEBAR_PROJECT_COMPACT_KEY, false);
/** アーカイブ済みのチャットを出すか（初めは出す） */
export const useShowArchivedChats = () => useSharedFlag(SIDEBAR_SHOW_ARCHIVED_KEY, true);

/** 自分が見る番か（カンバンの回答待ち・未読の列と同じ） */
export const isWaitingState = (state: AgentState) => {
  const column = boardColumnOf(state);
  return column === "needs_input" || column === "review";
};

/** 自分待ちのチャット（アーカイブしたものは除く）。pending は ApprovalsContext の回答待ちの一覧 */
export const waitingRuns = (runs: Run[], pending: ApprovalIndex) => runs.filter((r) => !r.archived_at && isWaitingState(runStateOf(r, pending)));

const FOLD_ALL_EVENT = "kickoff:sidebar-fold-all";

/**
 * 見出しの行の「すべて閉じる / 開く」: プロジェクトだけでなく、中のまとまり（グループ・グループなし・固定・アーカイブ済み・並べ方のまとまり）もすべて開閉する。
 * 描かれている部品には知らせ（useFoldAll）で伝え、開くときは、描かれていないまとまり（閉じたプロジェクトの中など）の覚えている値も開いたにする
 */
export function foldAll(collapsed: boolean) {
  if (!collapsed) {
    for (const key of Object.keys(localStorage)) if (key.startsWith(SIDEBAR_SECTION_CLOSED_PREFIX)) localStorage.setItem(key, "0");
  }
  window.dispatchEvent(new CustomEvent<boolean>(FOLD_ALL_EVENT, { detail: collapsed }));
}

/** 「すべて閉じる / 開く」を受け取る（collapsed: 閉じるなら true） */
export function useFoldAll(handler: (collapsed: boolean) => void) {
  useWindowEvent(FOLD_ALL_EVENT, (e) => handler((e as CustomEvent<boolean>).detail));
}
