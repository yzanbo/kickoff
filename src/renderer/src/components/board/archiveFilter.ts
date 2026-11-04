import type { Run } from "../../../../core/types";
import { useStoredState } from "../../hooks/useStoredState";
import { useShowArchivedChats } from "../sidebar/sidebarFlags";

/** アーカイブでの絞り込み（all: すべて / active: 未アーカイブ / archived: アーカイブ済み）。カンバンとグループのボードで共通 */
export type ArchiveFilter = "all" | "active" | "archived";

/** 保存の形式は、2 択だったころのまま（"1" = すべて、"0" = 未アーカイブ）。アーカイブ済みだけは "archived" */
// 保存していなければ「すべてのチャット」（"1"）。"0" は未アーカイブだけ
export const decodeArchiveFilter = (raw: string | null): ArchiveFilter => (raw === null || raw === "1" ? "all" : raw === "archived" ? "archived" : "active");
export const encodeArchiveFilter = (value: ArchiveFilter): string => (value === "all" ? "1" : value === "archived" ? "archived" : "0");

/**
 * ボードの絞り込みの値（純粋関数）。アーカイブ済みを出すかはサイドバー・右のパネルのタブと共通の設定（shown）で決め、
 * 出しているときだけ、ボードで覚えた「アーカイブ済みだけ」（stored）を効かせる
 */
export const linkedArchiveFilter = (shown: boolean, stored: ArchiveFilter): ArchiveFilter => (!shown ? "active" : stored === "archived" ? "archived" : "all");

/**
 * アーカイブでの絞り込み。サイドバー・右のパネルのタブと連動する（kickoff:sidebar-show-archived）: 「すべて」「アーカイブ済み」を選ぶと
 * どこでもアーカイブ済みを出し、「未アーカイブ」を選ぶとどこでも隠す（サイドバー・タブで切り替えても、ボードも同じになる）。
 * 「アーカイブ済みだけ」はボードの中だけの絞り込みとして、ボードごとに key で覚える（保存の形は "1" / "0" / "archived" のまま）
 */
export function useArchiveFilter(key: string): [ArchiveFilter, (value: ArchiveFilter) => void] {
  const [shown, setShown] = useShowArchivedChats();
  const [stored, setStored] = useStoredState<ArchiveFilter>(key, decodeArchiveFilter, encodeArchiveFilter);
  const set = (value: ArchiveFilter) => {
    setStored(value);
    setShown(value !== "active");
  };
  return [linkedArchiveFilter(shown, stored), set];
}

/** そのチャットを出すか（未アーカイブのときはアーカイブ済みを、アーカイブ済みのときは未アーカイブを出さない） */
export const archiveMatches = (run: Pick<Run, "archived_at">, filter: ArchiveFilter) => filter === "all" || (filter === "archived") === Boolean(run.archived_at);
