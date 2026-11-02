import { GitBranch } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { boardColumnOf } from "../../../../core/board";
import { BOARD_COLUMN_LABELS, BOARD_COLUMNS, type GitWorktree } from "../../../../core/types";
import type { BoardEntry } from "../board/boardColumns";
import { COLUMN_TONE } from "../board/tones";
import { useStoredFlagMap } from "../../hooks/useStoredState";
import { cx } from "../../cx";
import { useWorktreeList } from "../../worktree/worktreeBranches";
import { compareWorkplaces, workplaceOf, WORKPLACE_KIND_LABELS, type RunWorkplace } from "../../worktree/workplace";
import type { ChatGrouping } from "./chatGroupings";
import { Collapse } from "../Collapse";
import { GroupToggle } from "./GroupToggle";
import { SIDEBAR_SECTION_CLOSED_PREFIX } from "../../storageKeys";
import { useFoldAll } from "./sidebarFlags";

/** まとまりの開閉（プロジェクト・並べ方・まとまりごとに覚える。検索中は開いて見せる） */
const OpenState = createContext<{ isClosed: (id: string) => boolean; toggle: (id: string) => void; set: (id: string, closed: boolean) => void; forceOpen: boolean }>({
  isClosed: () => false,
  toggle: () => {},
  set: () => {},
  forceOpen: false,
});

/** 見出しつきのまとまり（見出しは 開閉・印・名前・件数。ボードの列の見出しと同じ形）。見出しを押すと開閉する */
function Group({
  id,
  mark,
  label,
  extra,
  title,
  rows,
  renderRow,
}: {
  id: string;
  mark: ReactNode;
  label: string;
  extra?: string;
  title?: string;
  rows: BoardEntry[];
  renderRow: (row: BoardEntry) => ReactNode;
}) {
  const state = useContext(OpenState);
  const open = state.forceOpen || !state.isClosed(id);
  // 見出しの行の「すべて閉じる / 開く」
  useFoldAll((collapsed) => state.set(id, collapsed));
  return (
    <div className="status-group">
      <div className="status-group-head" title={title}>
        <GroupToggle open={open} onToggle={() => state.toggle(id)} />
        <button className="status-group-name" aria-expanded={open} onClick={() => state.toggle(id)}>
          {mark}
          <span className="status-group-label">{label}</span>
          {extra && <span className="status-group-extra">{extra}</span>}
          <span className="status-group-count">{rows.length}</span>
        </button>
      </div>
      <Collapse open={open} indent>
        <ul className="chat-rows">{rows.map(renderRow)}</ul>
      </Collapse>
    </div>
  );
}

/**
 * サイドバーのチャットを、並べ方（状態・作業場所）でまとめて出す。「新しい順」はまとめないので使わない。
 * まとまりはそれぞれ開閉でき、プロジェクト・グループ・並べ方ごとに覚える。forceOpen（検索中）のときはすべて開く。
 * グループなしだけでなく、自分で作ったグループの中でも同じようにまとめる
 */
export function GroupedChatRows({
  grouping,
  projectId,
  rows,
  renderRow,
  forceOpen = false,
  scope,
}: {
  grouping: Exclude<ChatGrouping, "recent">;
  projectId: number;
  rows: BoardEntry[];
  renderRow: (row: BoardEntry) => ReactNode;
  forceOpen?: boolean;
  /** 自分で作ったグループの中・アーカイブ済みの中でまとめるとき、そのまとまり（開閉をまとまりごとに覚える。なければグループなし） */
  scope?: number | "archived";
}) {
  const closed = useStoredFlagMap(SIDEBAR_SECTION_CLOSED_PREFIX);
  const worktrees = useWorktreeList(projectId);
  const scopeKey = scope === undefined ? "" : scope === "archived" ? "archived:" : `g${scope}:`;
  const idOf = (key: string) => `${projectId}:${scopeKey}${grouping}:${key}`;
  const state = {
    isClosed: (key: string) => closed.get(idOf(key)),
    toggle: (key: string) => closed.toggle(idOf(key)),
    set: (key: string, on: boolean) => closed.set(idOf(key), on),
    forceOpen,
  };
  return <OpenState.Provider value={state}>{groupsOf(grouping, worktrees, rows, renderRow)}</OpenState.Provider>;
}

function groupsOf(grouping: Exclude<ChatGrouping, "recent">, worktrees: GitWorktree[] | undefined, rows: BoardEntry[], renderRow: (row: BoardEntry) => ReactNode) {
  // 状態は、ボードの列と同じ分け方（作業中・回答待ち・確認待ち・完了）
  if (grouping === "status") {
    return BOARD_COLUMNS.map((column) => {
      const group = rows.filter((r) => boardColumnOf(r.state) === column);
      if (group.length === 0) return null;
      const mark = <span className="status-group-dot" style={{ background: COLUMN_TONE[column] }} aria-hidden />;
      return <Group key={column} id={column} mark={mark} label={BOARD_COLUMN_LABELS[column]} rows={group} renderRow={renderRow} />;
    });
  }
  // 作業場所（本体・ワークツリー・フォルダなし・以前のブランチ）ごと。本体を先に（workplaceOf / compareWorkplaces）
  const byPlace = new Map<string, { place: RunWorkplace; rows: BoardEntry[] }>();
  for (const row of rows) {
    const place = workplaceOf(row.run, worktrees);
    const hit = byPlace.get(place.key);
    if (hit) hit.rows.push(row);
    else byPlace.set(place.key, { place, rows: [row] });
  }
  return [...byPlace.values()]
    .sort((a, b) => compareWorkplaces(a.place, b.place))
    .map(({ place, rows: list }) => (
      <Group
        key={place.key || "main"}
        id={place.key || "main"}
        mark={<GitBranch size={13} className={cx(place.kind === "worktree" && "status-group-worktree", (place.kind === "missing" || place.kind === "past") && "status-group-gone")} />}
        label={place.name || "本体"}
        extra={WORKPLACE_KIND_LABELS[place.kind]}
        title={place.title}
        rows={list}
        renderRow={renderRow}
      />
    ));
}
