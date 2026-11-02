import { useMemo, useState } from "react";
import { boardColumnOf } from "../../../../core/board";
import type { Run, RunGroup } from "../../../../core/types";
import { useRunStates } from "../../approvalsContext";
import { useChatSearch } from "../../chatSearch";
import { useSharedFlag } from "../../hooks/useStoredState";
import { SIDEBAR_WAITING_ONLY_KEY } from "../../storageKeys";
import type { StateFilter } from "./HeadCounts";
import { isWaitingState } from "./sidebarFlags";

/**
 * サイドバーの 1 プロジェクトのチャットの行の絞り込みと分け方。
 * 検索（プロジェクトの検索欄か、すべてのプロジェクトをまたぐ検索欄 searchAll）・自分待ち・見出しの状態の数で絞り、
 * 上に固定したもの・グループごと・グループなし・アーカイブ済みに分ける
 */
export function useWorkspaceRows({ runs, groups, searchAll }: { runs: Run[]; groups: RunGroup[]; searchAll: string }) {
  // 自分待ち（回答待ち・確認待ち）だけを出すか（上の行の「自分待ち」で切り替える）
  const [waitingOnly] = useSharedFlag(SIDEBAR_WAITING_ONLY_KEY);
  // プロジェクト内の検索: チャット名と、やり取りの中身（サーバーで全文検索）の両方で絞り込む
  const [query, setQuery] = useState("");
  const { keyword, matches } = useChatSearch(query || searchAll);
  // 見出しの状態の数を押して、その状態のチャットだけに絞る（このプロジェクトだけ。もう一度押すと戻す）
  const [stateFilter, setStateFilter] = useState<StateFilter | null>(null);
  // 検索・自分待ち・状態で絞り込んでいる間は、まとまりを開いて見せ、空のまとまりは隠す
  const filtering = Boolean(keyword) || waitingOnly || stateFilter !== null;

  const { pending, stateOf } = useRunStates();
  // 行の分け方は、チャット・絞り込み・回答待ちの一覧が変わったときだけ計算し直す（matches は検索語が変わるまで同じ関数）
  const { allRows, visibleRows, pinnedRows, rows, archivedMatches, ungroupedRows } = useMemo(() => {
    const withState = (run: Run) => ({ run, state: stateOf(run) });
    const allRows = runs.filter((r) => !r.archived_at).map(withState);
    // アーカイブしたチャット（一覧の下にまとめて、開閉できる。最初は閉じておく）
    const archivedRows = runs.filter((r) => r.archived_at).map(withState);
    const visibleRows = allRows.filter(
      ({ run, state }) => matches(run) && (!waitingOnly || isWaitingState(state)) && (stateFilter === null || boardColumnOf(state) === stateFilter),
    );
    // 上に固定したチャットは、グループ・グループなしから抜き出して、いちばん上にまとめる
    const pinnedRows = visibleRows.filter(({ run }) => run.pinned);
    const rows = visibleRows.filter(({ run }) => !run.pinned);
    const archivedMatches = archivedRows.filter(({ run }) => matches(run));
    const groupIds = new Set(groups.map((g) => g.id));
    const ungroupedRows = rows.filter(({ run }) => run.group_id === null || !groupIds.has(run.group_id));
    return { allRows, visibleRows, pinnedRows, rows, archivedMatches, ungroupedRows };
  }, [runs, groups, matches, waitingOnly, stateFilter, stateOf]);
  const groupedRows = (id: number) => rows.filter(({ run }) => run.group_id === id);

  return {
    waitingOnly,
    query,
    setQuery,
    keyword,
    stateFilter,
    setStateFilter,
    filtering,
    pending,
    /** アーカイブしていないすべての行 / 絞り込みを通した行 */
    allRows,
    visibleRows,
    /** 絞り込みを通した行のうち、上に固定したもの / それ以外 */
    pinnedRows,
    rows,
    /** 検索に一致するアーカイブ済みの行 */
    archivedMatches,
    /** そのグループの行 / どのグループにも入っていない行（消えたグループのものも含む） */
    groupedRows,
    ungroupedRows,
  };
}
