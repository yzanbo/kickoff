import { GitBranch } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { boardColumnOf } from "../../../../core/board";
import { BOARD_COLUMN_LABELS, BOARD_COLUMNS, PHASES, type AgentState, type Run } from "../../../../core/types";
import { COLUMN_TONE } from "../board/tones";
import { SECTION_META } from "../../sections";
import { useStoredFlagMap } from "../../hooks/useStoredState";
import { useRunBranch } from "../../worktreeBranches";
import type { ChatGrouping } from "./ChatGroupingMenu";
import { GroupToggle } from "./GroupToggle";

type Row = { run: Run; state: AgentState };

/** まとまりの開閉（プロジェクト・並べ方・まとまりごとに覚える。検索中は開いて見せる） */
const OpenState = createContext<{ isClosed: (id: string) => boolean; toggle: (id: string) => void; forceOpen: boolean }>({
  isClosed: () => false,
  toggle: () => {},
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
  rows: Row[];
  renderRow: (row: Row) => ReactNode;
}) {
  const state = useContext(OpenState);
  const open = state.forceOpen || !state.isClosed(id);
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
      {open && <ul className="chat-rows">{rows.map(renderRow)}</ul>}
    </div>
  );
}

/**
 * サイドバーのチャットを、並べ方（状態・作業場所・セクション）でまとめて出す。「新しい順」はまとめないので使わない。
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
  rows: Row[];
  renderRow: (row: Row) => ReactNode;
  forceOpen?: boolean;
  /** 自分で作ったグループの中でまとめるとき、そのグループ（開閉をグループごとに覚える。なければグループなし） */
  scope?: number;
}) {
  const closed = useStoredFlagMap("kickoff:sidebar-group-closed:");
  const idOf = (key: string) => `${projectId}:${scope === undefined ? "" : `g${scope}:`}${grouping}:${key}`;
  const state = { isClosed: (key: string) => closed.get(idOf(key)), toggle: (key: string) => closed.toggle(idOf(key)), forceOpen };
  return <OpenState.Provider value={state}>{groupsOf(grouping, projectId, rows, renderRow)}</OpenState.Provider>;
}

function groupsOf(grouping: Exclude<ChatGrouping, "recent">, projectId: number, rows: Row[], renderRow: (row: Row) => ReactNode) {
  // 状態は、ボードの列と同じ分け方（作業中・回答待ち・確認待ち・完了）
  if (grouping === "status") {
    return BOARD_COLUMNS.map((column) => {
      const group = rows.filter((r) => boardColumnOf(r.state) === column);
      if (group.length === 0) return null;
      const mark = <span className="status-group-dot" style={{ background: COLUMN_TONE[column] }} aria-hidden />;
      return <Group key={column} id={column} mark={mark} label={BOARD_COLUMN_LABELS[column]} rows={group} renderRow={renderRow} />;
    });
  }
  if (grouping === "phase") {
    return PHASES.map((phase) => {
      const group = rows.filter((r) => r.run.phase === phase);
      if (group.length === 0) return null;
      const Icon = SECTION_META[phase].icon;
      return <Group key={phase} id={phase} mark={<Icon size={13} className={`sec-icon sec-${phase}`} />} label={SECTION_META[phase].label} rows={group} renderRow={renderRow} />;
    });
  }
  // 作業場所（本体・ワークツリー）ごと。本体を先に、ワークツリーはフォルダの名前順
  return [...new Set(rows.map((r) => r.run.worktree_path))]
    .sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map((path) => <WorktreeGroup key={path || "main"} projectId={projectId} path={path} rows={rows.filter((r) => r.run.worktree_path === path)} renderRow={renderRow} />);
}

/** 作業場所でまとめるときのまとまり（見出しはブランチ名と、本体かワークツリーか） */
function WorktreeGroup({ projectId, path, rows, renderRow }: { projectId: number; path: string; rows: Row[]; renderRow: (row: Row) => ReactNode }) {
  const branch = useRunBranch({ project_id: projectId, worktree_path: path });
  const name = branch ?? (path ? (path.split("/").pop() ?? path) : "本体");
  return (
    <Group
      id={path || "main"}
      mark={<GitBranch size={13} className={path ? "status-group-worktree" : undefined} />}
      label={name}
      extra={path ? "ワークツリー" : "本体"}
      title={path || "本体"}
      rows={rows}
      renderRow={renderRow}
    />
  );
}
