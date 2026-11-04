import { useMemo, useState } from "react";
import { boardColumnOf } from "@shared/chat/state";
import type { Chat, ChatGroup } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { useChatSearch } from "@/features/chat/chatSearch";
import { useSetting } from "@/hooks/useSetting";
import { SIDEBAR_WAITING_ONLY } from "@/lib/storageKeys";
import type { CountedColumn } from "@/features/chat/chatState";
import { isWaitingState } from "@/features/chatList/chatListFlags";

/**
 * サイドバーの 1 プロジェクトのチャットの行の絞り込みと分け方。
 * 検索（プロジェクトの検索欄か、すべてのプロジェクトをまたぐ検索欄 searchAll）・自分待ち・見出しの状態の数で絞り、
 * 上に固定したもの・グループごと・グループなし・アーカイブ済みに分ける
 */
export function useWorkspaceRows({ chats, groups, searchAll }: { chats: Chat[]; groups: ChatGroup[]; searchAll: string }) {
  // 自分待ち（回答待ち・未読）だけを出すか（上の行の「自分待ち」で切り替える）
  const [waitingOnly] = useSetting(SIDEBAR_WAITING_ONLY);
  // プロジェクト内の検索: チャット名と、やり取りの中身（サーバーで全文検索）の両方で絞り込む
  const [query, setQuery] = useState("");
  const { keyword, matches } = useChatSearch(query || searchAll);
  // 見出しの状態の数を押して、その状態のチャットだけに絞る（このプロジェクトだけ。もう一度押すと戻す）
  const [stateFilter, setStateFilter] = useState<CountedColumn | null>(null);
  // 検索・自分待ち・状態で絞り込んでいる間は、まとまりを開いて見せ、空のまとまりは隠す
  const filtering = Boolean(keyword) || waitingOnly || stateFilter !== null;

  const { pending, stateOf } = useChatStates();
  // 行の分け方は、チャット・絞り込み・回答待ちの一覧が変わったときだけ計算し直す（matches は検索語が変わるまで同じ関数）
  const { allRows, visibleRows, pinnedRows, rows, archivedMatches, ungroupedRows } = useMemo(() => {
    const withState = (chat: Chat) => ({ chat, state: stateOf(chat) });
    const allRows = chats.filter((r) => !r.archived_at).map(withState);
    // アーカイブしたチャット（一覧の下にまとめて、開閉できる。最初は閉じておく）
    const archivedRows = chats.filter((r) => r.archived_at).map(withState);
    const visibleRows = allRows.filter(
      ({ chat, state }) => matches(chat) && (!waitingOnly || isWaitingState(state)) && (stateFilter === null || boardColumnOf(state) === stateFilter),
    );
    // 上に固定したチャットは、グループ・グループなしから抜き出して、いちばん上にまとめる
    const pinnedRows = visibleRows.filter(({ chat }) => chat.pinned);
    const rows = visibleRows.filter(({ chat }) => !chat.pinned);
    const archivedMatches = archivedRows.filter(({ chat }) => matches(chat));
    const groupIds = new Set(groups.map((g) => g.id));
    const ungroupedRows = rows.filter(({ chat }) => chat.group_id === null || !groupIds.has(chat.group_id));
    return { allRows, visibleRows, pinnedRows, rows, archivedMatches, ungroupedRows };
  }, [chats, groups, matches, waitingOnly, stateFilter, stateOf]);
  const groupedRows = (id: number) => rows.filter(({ chat }) => chat.group_id === id);

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
