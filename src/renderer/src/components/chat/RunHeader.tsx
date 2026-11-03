import { Archive, ArchiveRestore, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import type { Project, Run } from "../../../../core/types";
import { toggleArchiveRunNow } from "../../runActions";
import { useExternalTerminal } from "../../externalTerminal";
import { IconButton } from "../IconButton";
import { ProjectChip } from "../ProjectChip";
import { busyWithUnread } from "../../../../core/board";
import { useRunStates } from "../../approvalsContext";
import { RUN_STATUS_LABELS } from "../RunStatus";
import { StatusSlot } from "../StatusSlot";
import { WorktreeChip } from "../WorktreeChip";

/**
 * チャットの見出し: プロジェクト・作業場所のバッジ、右に道具（検索・横幅・アーカイブ・外部のターミナル）・ターン数と API 換算・状態。
 * 名前と閉じるはパネルのタブにあるので、ここには出さない（名前はタブのダブルクリックで変える）。waiting は確認（回答待ち）があるか
 */
export function RunHeader({
  run,
  project,
  waiting,
  tools,
}: {
  run: Run;
  project?: Project;
  waiting: boolean;
  /** 右の道具の列の先頭に置くもの（チャットの中の検索・発言の目次） */
  tools?: ReactNode;
}) {
  const external = useExternalTerminal();
  // 状態の印はサイドバーの行・パネルのタブと同じもの（回答待ちの確認があれば回答待ち）
  const { stateOf } = useRunStates();
  const state = waiting ? "needs_input" : stateOf(run);
  return (
    <header className="run-header">
      <div className="run-title-row">
        {/* どのプロジェクト・作業場所のチャットか（サイドバーと同じ色のバッジ。押すとそのプロジェクトのカンバン） */}
        <span className="run-sub muted small">
          {project && <ProjectChip id={project.id} name={project.name} linked />}
          <WorktreeChip run={run} />
        </span>
        {run.archived_at && <span className="archived-chip">アーカイブ済み</span>}
        <span className="spacer" />
        {/* 作業場所の道具（右に寄せ、名前・バッジと分ける。アプリの中のターミナルはパネルのタブの列のボタンから） */}
        <span className="run-tools">
        {tools}
        {/* アーカイブ（一覧から隠す。会話の記録は残る）/ 戻す */}
        <IconButton
          icon={run.archived_at ? ArchiveRestore : Archive}
          size={13}
          title={run.archived_at ? "アーカイブから戻す" : "アーカイブ（一覧から隠す。会話の記録は残ります）"}
          label={run.archived_at ? "アーカイブから戻す" : "アーカイブ"}
          onClick={() => void toggleArchiveRunNow(run)}
        />
        {/* 外部のターミナル（アプリの外。設定で選んだアプリ）で、作業場所を開く */}
        {window.kickoff && project && (
          <IconButton
            icon={ExternalLink}
            size={13}
            label="外部のターミナルで作業場所を開く"
            title={`${external.label}で開く（${run.worktree_path || project.repo_path}）。アプリは設定の「ターミナル」で選べます`}
            onClick={() => external.open(run.worktree_path || project.repo_path)}
          />
        )}
        </span>
        {/* ターン数と費用（狭いときは隠す） */}
        {(run.num_turns > 0 || run.cost_usd > 0) && (
          <span className="run-meta muted small">
            {run.num_turns > 0 && <span>{run.num_turns} ターン</span>}
            {run.cost_usd > 0 && <span title="サブスクリプション利用時も API 料金に換算した参考値">API 換算 ${run.cost_usd.toFixed(2)}</span>}
          </span>
        )}
        <span className={`run-state state-${waiting ? "waiting" : run.status}`}>
          <StatusSlot state={state} unread={busyWithUnread(run, state)} />
          {RUN_STATUS_LABELS[waiting ? "waiting" : run.status]}
        </span>
      </div>
    </header>
  );
}
