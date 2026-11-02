import { CircleAlert, CircleCheck, CircleDot, CircleX, GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import { AGENT_STATE_LABELS, AGENT_STATES, PHASES, type AgentState, type Run } from "../../../../core/types";
import { SECTION_META } from "../../sections";
import { useRunBranch } from "../../worktreeBranches";
import type { ChatGrouping } from "./ChatGroupingMenu";

type Row = { run: Run; state: AgentState };

/** 状態でまとめるときの見出しのアイコン */
const STATE_ICONS: Record<AgentState, typeof CircleAlert> = {
  needs_input: CircleAlert,
  failed: CircleX,
  attention: CircleCheck,
  running: CircleDot,
  done: CircleCheck,
};

/** 見出しつきのまとまり */
function Group({ head, rows, renderRow }: { head: ReactNode; rows: Row[]; renderRow: (row: Row) => ReactNode }) {
  return (
    <div className="status-group">
      {head}
      <ul className="chat-rows">{rows.map(renderRow)}</ul>
    </div>
  );
}

/** サイドバーのチャットを、並べ方（状態・作業場所・セクション）でまとめて出す。「新しい順」はまとめないので使わない */
export function GroupedChatRows({
  grouping,
  projectId,
  rows,
  renderRow,
}: {
  grouping: Exclude<ChatGrouping, "recent">;
  projectId: number;
  rows: Row[];
  renderRow: (row: Row) => ReactNode;
}) {
  if (grouping === "status") {
    return AGENT_STATES.map((state) => {
      const group = rows.filter((r) => r.state === state);
      if (group.length === 0) return null;
      const Icon = STATE_ICONS[state];
      const head = (
        <div className={`status-group-head state-${state}`}>
          <Icon size={14} />
          {AGENT_STATE_LABELS[state]}
        </div>
      );
      return <Group key={state} head={head} rows={group} renderRow={renderRow} />;
    });
  }
  if (grouping === "phase") {
    return PHASES.map((phase) => {
      const group = rows.filter((r) => r.run.phase === phase);
      if (group.length === 0) return null;
      const Icon = SECTION_META[phase].icon;
      const head = (
        <div className="status-group-head">
          <Icon size={14} className={`sec-icon sec-${phase}`} />
          {SECTION_META[phase].label}
        </div>
      );
      return <Group key={phase} head={head} rows={group} renderRow={renderRow} />;
    });
  }
  // 作業場所（本体・ワークツリー）ごと。本体を先に、ワークツリーはフォルダの名前順
  return [...new Set(rows.map((r) => r.run.worktree_path))]
    .sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map((path) => (
      <Group
        key={path || "main"}
        head={<WorktreeGroupHead projectId={projectId} path={path} />}
        rows={rows.filter((r) => r.run.worktree_path === path)}
        renderRow={renderRow}
      />
    ));
}

/** 作業場所でまとめるときの見出し（ブランチ名と、本体かワークツリーか） */
function WorktreeGroupHead({ projectId, path }: { projectId: number; path: string }) {
  const branch = useRunBranch({ project_id: projectId, worktree_path: path });
  const name = branch ?? (path ? path.split("/").pop() : "本体");
  return (
    <div className={`status-group-head ${path ? "on-worktree" : ""}`} title={path || "本体"}>
      <GitBranch size={14} />
      {name}
      <span className="small">（{path ? "ワークツリー" : "本体"}）</span>
    </div>
  );
}
