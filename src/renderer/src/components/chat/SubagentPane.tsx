import { api } from "../../api";
import { BUSY_STATUSES } from "../RunStatus";
import { Composer } from "./Composer";
import { useSubagents } from "./Subagents";
import { relayMessage } from "./subagentRelay";
import { SubagentView } from "./SubagentView";
import { relativize } from "./timelineItems";
import { useRunDetail } from "./useRunDetail";

/**
 * パネルのタブで開いたサブエージェントの中身（チャットのサブエージェントの一覧・ツールのまとまりの「中身を見る」から開く）。
 * 親のチャットの記録を読み、そのサブエージェントの分だけを出す（作業中は追記されていく）。
 * 下の入力欄から追加の指示を送れる: メインのエージェントに、SendMessage でこのサブエージェントへそのまま伝えてもらう
 * （サブエージェントは続きから始める）。メインが作業中なら送信待ちに入れ、終わったら届ける（割り込んで止めはしない）
 */
export function SubagentPane({ projectId, runId, toolUseId }: { projectId: number; runId: number; toolUseId: string }) {
  const { run, project, events, background, error } = useRunDetail(runId, projectId);
  const busy = run ? BUSY_STATUSES.includes(run.status) : false;
  const subagents = useSubagents(runId, events, busy, background);
  if (error) return <div className="page error">{error}</div>;
  if (!run) return <div className="page muted">読み込み中…</div>;
  const entry = subagents.find((s) => s.key === toolUseId);
  if (!entry) return <div className="page muted">このサブエージェントは見つかりません（チャットを書き直した・巻き戻したときなど）</div>;
  const rel = (s: string) => (project ? relativize(s, project.repo_path) : s);
  const agentId = entry.agentId;
  // 作業中でなければすぐ送り、作業中なら送信待ちに入れる（どちらも queue の API が決める）
  const relay = async (text: string, attachments: Parameters<typeof api.queueMessage>[3]) => {
    if (agentId) await api.queueMessage(run.id, relayMessage(agentId, entry.description, text), {}, attachments);
  };
  return (
    <div className="subagent-pane">
      <SubagentView entry={entry} events={events} rel={rel} busy={busy} />
      <div className="run-composer subagent-composer">
        {agentId ? (
          <Composer
            busy={busy}
            placeholder={
              busy
                ? "メインのエージェントが作業中です。送ると送信待ちに入り、終わったらこのサブエージェントに伝えます"
                : "このサブエージェントに追加の指示（メインのエージェントから伝えます。Enter で送信）"
            }
            onSend={relay}
            onQueue={(text, attachments) => relay(text, attachments)}
          />
        ) : (
          <p className="muted small">このサブエージェントの ID が記録に残っていないため、追加の指示は送れません（以前のチャット）</p>
        )}
      </div>
    </div>
  );
}
