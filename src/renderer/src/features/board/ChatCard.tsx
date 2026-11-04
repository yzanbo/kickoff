import { busyWithUnread } from "@shared/chat/state";
import { AGENT_STATE_LABELS, type AgentState, type Run } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import type { RunTitleEditor } from "@/features/chat/useChatRename";
import { relativeTime } from "@/lib/time";
import { ChatTitleInput } from "@/features/chat/ChatTitleInput";
import { ProjectChip } from "@/features/project/ProjectChip";
import { WorktreeChip } from "@/features/worktree/WorktreeChip";
import { StatusDot } from "@/ui/StatusDot";
import { STATE_TONE } from "@/features/chat/tones";

interface Props {
  run: Run;
  state: AgentState;
  /** 全プロジェクトのボードでは、プロジェクトのバッジを出す */
  projectName?: string;
  /** 回答待ちの数 */
  pending?: number;
  /** 名前をその場で変えている途中のとき */
  rename?: RunTitleEditor;
}


/** ボードのカードの中身（名前・ラベル・状態・時刻） */
export function RunCardContent({ run, state, projectName, pending = 0, rename }: Props) {
  return (
    <>
      {rename ? <ChatTitleInput run={run} editor={rename} /> : <span className="card-title">{chatTitle(run.title)}</span>}
      <div className="card-labels">
        {projectName !== undefined && <ProjectChip id={run.project_id} name={projectName} />}
        <WorktreeChip run={run} />
        {run.archived_at && <span className="archived-chip">アーカイブ済み</span>}
      </div>
      <div className="card-foot">
        <StatusDot color={STATE_TONE[state]} />
        <span className="card-state">{AGENT_STATE_LABELS[state]}</span>
        {busyWithUnread(run, state) && <UnreadMark />}
        {pending > 0 && <span className="card-pending">回答 {pending}件</span>}
        <span className="card-time">{relativeTime(run.active_at)}</span>
      </div>
    </>
  );
}

/** リスト表示の行の中身 */
export function RunRowContent({ run, state, projectName, rename }: Props) {
  return (
    <>
      <div className="list-main">
        {rename ? <ChatTitleInput run={run} editor={rename} /> : <span className="card-title one-line">{chatTitle(run.title)}</span>}
        <span className="list-meta">
          {projectName !== undefined && <ProjectChip id={run.project_id} name={projectName} />}
          <WorktreeChip run={run} />
          {run.archived_at && <span className="archived-chip">アーカイブ済み</span>}
          <StatusDot color={STATE_TONE[state]} />
          <span className="muted small">{AGENT_STATE_LABELS[state]}</span>
          {busyWithUnread(run, state) && <UnreadMark />}
        </span>
      </div>
      <span className="card-time">{relativeTime(run.active_at)}</span>
    </>
  );
}

/** 作業中のまま、まだ見ていない返答がある（状態の横に添える） */
function UnreadMark() {
  return <span className="card-unread">未読あり</span>;
}
