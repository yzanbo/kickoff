// ワークツリーの SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";
import type { WorktreePrNotice } from "@shared/git/types";

export const worktreeEvents = {
  /** プロジェクトのブランチを替えた・ワークツリーを足した・消した（コアの HEAD の見張り。画面はワークツリーの一覧を取り直す） */
  worktrees_changed: event<{ project_id: number }>(),
  /** ワークツリーの PR の知らせ（そのプロジェクトの分を丸ごと。変わったときだけ） */
  worktree_prs: event<{ project_id: number; notices: WorktreePrNotice[] }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof worktreeEvents> {}
}
