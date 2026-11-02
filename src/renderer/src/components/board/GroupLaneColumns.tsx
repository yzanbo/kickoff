import type { ReactNode } from "react";
import { BOARD_COLUMN_LABELS, BOARD_COLUMNS } from "../../../../core/types";
import { DraftCards } from "../sidePanel/DraftCards";
import type { SidePanelController } from "../sidePanel/useSidePanel";
import { ArchiveAllButton } from "./ArchiveAllButton";
import { byColumn, type BoardEntry } from "./boardColumns";
import { ColumnHead } from "./ColumnHead";
import { COLUMN_TONE, DRAFT_TONE } from "./tones";

/** グループのタブのスイムレーンで、1 つのグループの段に並べる列（下書き・作業中・回答待ち・確認待ち・完了） */
export function GroupLaneColumns({
  entries,
  groupId,
  projectId,
  panel,
  renderCard,
}: {
  entries: BoardEntry[];
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
      <section className="board-column">
        <ColumnHead label="下書き" tone={DRAFT_TONE} count={draftCount} />
        <div className="column-cards">
          <DraftCards panel={panel} filter={inGroup} />
          {draftCount === 0 && <p className="column-empty">なし</p>}
        </div>
      </section>
      {BOARD_COLUMNS.map((c) => {
        const cards = columns.get(c) ?? [];
        return (
          <section key={c} className="board-column">
            <ColumnHead
              label={BOARD_COLUMN_LABELS[c]}
              tone={COLUMN_TONE[c]}
              count={cards.length}
              action={c === "done" ? <ArchiveAllButton runs={cards.map((e) => e.run)} /> : undefined}
            />
            <div className="column-cards">
              {cards.length === 0 && <p className="column-empty">なし</p>}
              {cards.map(renderCard)}
            </div>
          </section>
        );
      })}
    </>
  );
}
