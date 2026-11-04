import type { ReactNode } from "react";
import { BOARD_COLUMNS } from "@shared/types";
import { DraftCards } from "./DraftCards";
import type { SidePanelController } from "@/features/panel/usePanel";
import { byColumn, type BoardEntry } from "@/features/chatList/boardColumns";
import { DraftColumn, StateColumn } from "./StateColumn";

/** グループのタブのスイムレーンで、1 つのグループの段に並べる列（下書き・作業中・回答待ち・未読・既読） */
export function GroupLaneColumns({
  entries,
  foldKey,
  groupId,
  projectId,
  panel,
  renderCard,
}: {
  entries: BoardEntry[];
  /** アーカイブ済みのまとまりの開閉を覚える名前（段ごと） */
  foldKey: string;
  /** null はグループなし */
  groupId: number | null;
  projectId: number;
  panel: SidePanelController;
  renderCard: (entry: BoardEntry) => ReactNode;
}) {
  const columns = byColumn(entries);
  const inGroup = (t: { projectId: number; group?: number }) => t.projectId === projectId && (t.group ?? null) === groupId;
  const draftCount = panel.drafts.filter((d) => inGroup(d.target)).length;
  return (
    <>
      <DraftColumn count={draftCount}>
        <DraftCards panel={panel} filter={inGroup} />
      </DraftColumn>
      {BOARD_COLUMNS.map((c) => (
        <StateColumn key={c} column={c} entries={columns.get(c) ?? []} foldKey={`${foldKey}:${c}`} render={renderCard} />
      ))}
    </>
  );
}
