import type { ReactNode } from "react";
import { AGENT_STATE_LABELS, type AgentState, type Run } from "../../../../core/types";
import { chatTitle } from "../../chatTitle";
import type { RunTitleEditor } from "../../hooks/useRunRename";
import { relativeTime } from "../../time";
import { ChatTitleInput } from "../ChatTitleInput";
import { ProjectChip } from "../ProjectChip";
import { WorktreeChip } from "../WorktreeChip";
import { SectionBadge } from "../SectionBadge";
import { STATE_TONE } from "./tones";

interface Props {
  run: Run;
  state: AgentState;
  /** 全プロジェクトのボードでは、プロジェクトのバッジを出す */
  projectName?: string;
  /** 回答待ちの数 */
  pending?: number;
  /** 列を移す矢印など（いちばん右） */
  trailing?: ReactNode;
  /** 名前をその場で変えている途中のとき */
  rename?: RunTitleEditor;
}


/** ボードのカードの中身（名前・ラベル・状態・時刻） */
export function RunCardContent({ run, state, projectName, pending = 0, trailing, rename }: Props) {
  return (
    <>
      {rename ? <ChatTitleInput run={run} editor={rename} /> : <span className="card-title">{chatTitle(run.title)}</span>}
      <div className="card-labels">
        {projectName !== undefined && <ProjectChip id={run.project_id} name={projectName} />}
        <SectionBadge section={run.phase} short />
        <WorktreeChip run={run} />
        {run.archived_at && <span className="archived-chip">アーカイブ済み</span>}
      </div>
      <div className="card-foot">
        <span className="dot" style={{ background: STATE_TONE[state] }} />
        <span className="card-state">{AGENT_STATE_LABELS[state]}</span>
        {pending > 0 && <span className="card-pending">回答 {pending}件</span>}
        <span className="card-time">{relativeTime(run.updated_at)}</span>
        {trailing}
      </div>
    </>
  );
}

/** リスト表示の行の中身 */
export function RunRowContent({ run, state, projectName, trailing, rename }: Props) {
  return (
    <>
      <div className="list-main">
        {rename ? <ChatTitleInput run={run} editor={rename} /> : <span className="card-title one-line">{chatTitle(run.title)}</span>}
        <span className="list-meta">
          {projectName !== undefined && <ProjectChip id={run.project_id} name={projectName} />}
          <SectionBadge section={run.phase} short />
          <WorktreeChip run={run} />
          {run.archived_at && <span className="archived-chip">アーカイブ済み</span>}
          <span className="dot" style={{ background: STATE_TONE[state] }} />
          <span className="muted small">{AGENT_STATE_LABELS[state]}</span>
        </span>
      </div>
      <span className="card-time">{relativeTime(run.updated_at)}</span>
      {trailing}
    </>
  );
}
