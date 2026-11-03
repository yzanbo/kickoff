import { BUSY_STATUSES } from "../RunStatus";
import { useSubagents } from "./Subagents";
import { SubagentView } from "./SubagentView";
import { relativize } from "./timelineItems";
import { useRunDetail } from "./useRunDetail";

/**
 * パネルのタブで開いたサブエージェントの中身（チャットのサブエージェントの一覧・ツールのまとまりの「中身を見る」から開く）。
 * 親のチャットの記録を読み、そのサブエージェントの分だけを出す（作業中は追記されていく）
 */
export function SubagentPane({ projectId, runId, toolUseId }: { projectId: number; runId: number; toolUseId: string }) {
  const { run, project, events, error } = useRunDetail(runId, projectId);
  const busy = run ? BUSY_STATUSES.includes(run.status) : false;
  const subagents = useSubagents(runId, events, busy);
  if (error) return <div className="page error">{error}</div>;
  if (!run) return <div className="page muted">読み込み中…</div>;
  const entry = subagents.find((s) => s.key === toolUseId);
  if (!entry) return <div className="page muted">このサブエージェントは見つかりません（チャットを書き直した・巻き戻したときなど）</div>;
  const rel = (s: string) => (project ? relativize(s, project.repo_path) : s);
  return <SubagentView entry={entry} events={events} rel={rel} busy={busy} />;
}
