import { boardColumnOf } from "../../../../core/board";
import { BOARD_COLUMNS, type AgentState, type BoardColumn, type Run } from "../../../../core/types";

export type BoardEntry = { run: Run; state: AgentState };

/** チャットを状態の列に分ける（並びはそのまま） */
export function byColumn(entries: BoardEntry[]) {
  const map = new Map<BoardColumn, BoardEntry[]>(BOARD_COLUMNS.map((c) => [c, []]));
  for (const e of entries) map.get(boardColumnOf(e.state))?.push(e);
  return map;
}
