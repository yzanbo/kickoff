import type { ReactNode } from "react";
import { AGENT_STATE_LABELS, type AgentState, type Run } from "../../../../core/types";
import { chatTitle } from "../../chatTitle";
import { relativeTime } from "../../time";
import { ProjectChip } from "../ProjectChip";
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
}


/** ボードのカードの中身（名前・ラベル・状態・時刻） */
export function RunCardContent({ run, state, projectName, pending = 0, trailing }: Props) {
  return (
    <>
      <span className="card-title">{chatTitle(run.title)}</span>
      <div className="card-labels">
        {projectName !== undefined && <ProjectChip id={run.project_id} name={projectName} />}
        <SectionBadge section={run.phase} short />
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
export function RunRowContent({ run, state, projectName, trailing }: Props) {
  return (
    <>
      <div className="list-main">
        <span className="card-title one-line">{chatTitle(run.title)}</span>
        <span className="list-meta">
          {projectName !== undefined && <ProjectChip id={run.project_id} name={projectName} />}
          <SectionBadge section={run.phase} short />
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
