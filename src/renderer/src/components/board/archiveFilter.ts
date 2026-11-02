import type { Run } from "../../../../core/types";
import { useStoredState } from "../../hooks/useStoredState";

/** アーカイブでの絞り込み（all: すべて / active: 未アーカイブ / archived: アーカイブ済み）。カンバンとグループのボードで共通 */
export type ArchiveFilter = "all" | "active" | "archived";

/** 保存の形式は、2 択だったころのまま（"1" = すべて、"0" = 未アーカイブ）。アーカイブ済みだけは "archived" */
// 保存していなければ「すべてのチャット」（"1"）。"0" は未アーカイブだけ
export const decodeArchiveFilter = (raw: string | null): ArchiveFilter => (raw === null || raw === "1" ? "all" : raw === "archived" ? "archived" : "active");
export const encodeArchiveFilter = (value: ArchiveFilter): string => (value === "all" ? "1" : value === "archived" ? "archived" : "0");

/** アーカイブでの絞り込み（ボードごとに key で覚える） */
export const useArchiveFilter = (key: string) => useStoredState<ArchiveFilter>(key, decodeArchiveFilter, encodeArchiveFilter);

/** そのチャットを出すか（未アーカイブのときはアーカイブ済みを、アーカイブ済みのときは未アーカイブを出さない） */
export const archiveMatches = (run: Pick<Run, "archived_at">, filter: ArchiveFilter) => filter === "all" || (filter === "archived") === Boolean(run.archived_at);
