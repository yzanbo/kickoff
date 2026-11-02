import { Archive, ArchiveRestore, Pencil, SquareTerminal } from "lucide-react";
import type { Project, Run } from "../../../../core/types";
import { CHAT_TITLE_MAX, chatTitle } from "../../chatTitle";
import { useRunRename } from "../../hooks/useRunRename";
import { toggleArchiveRunNow } from "../../runActions";
import { CloseButton, IconButton } from "../IconButton";
import { InlineName } from "../InlineName";
import { ProjectChip } from "../ProjectChip";
import { RUN_STATUS_LABELS, RunStatusIcon } from "../RunStatus";
import { SectionBadge } from "../SectionBadge";
import { terminalTargetOf, type TerminalTarget } from "../sidePanel/useSidePanel";
import { WorktreeChip } from "../WorktreeChip";

/**
 * チャットの見出し: 閉じる・セクション・名前（ダブルクリックか鉛筆でその場で変更）・アーカイブ・作業場所のターミナル・状態と、
 * その下にプロジェクト・作業場所・ターン数・API 換算の行。waiting は確認（回答待ち）があるか
 */
export function RunHeader({
  run,
  project,
  waiting,
  onClose,
  onOpenTerminal,
}: {
  run: Run;
  project?: Project;
  waiting: boolean;
  onClose: () => void;
  onOpenTerminal?: (target: TerminalTarget) => void;
}) {
  const rename = useRunRename();
  const editor = rename.editorFor(run);
  return (
    <header className="run-header">
      <div className="run-title-row">
        <CloseButton label="パネルを閉じる" title="閉じる（Esc）" size={15} onClick={onClose} />
        <SectionBadge section={run.phase} />
        {editor ? (
          <InlineName initial={run.title} maxLength={CHAT_TITLE_MAX} className="run-title-input" onSubmit={editor.onSubmit} onCancel={editor.onCancel} />
        ) : (
          <>
            <h1 title={`${run.title}（ダブルクリックで名前を変更）`} onDoubleClick={() => rename.start(run)}>
              {chatTitle(run.title)}
            </h1>
            <IconButton icon={Pencil} label="名前を変更" size={13} onClick={() => rename.start(run)} />
          </>
        )}
        {/* アーカイブ（一覧から隠す。会話の記録は残る）/ 戻す */}
        <IconButton
          icon={run.archived_at ? ArchiveRestore : Archive}
          size={13}
          title={run.archived_at ? "アーカイブから戻す" : "アーカイブ（一覧から隠す。会話の記録は残ります）"}
          label={run.archived_at ? "アーカイブから戻す" : "アーカイブ"}
          onClick={() => void toggleArchiveRunNow(run)}
        />
        {/* チャットの作業場所（ワークツリーなら、そのフォルダ）でターミナルを開く */}
        {onOpenTerminal && project && (
          <IconButton
            icon={SquareTerminal}
            size={13}
            label="作業場所でターミナルを開く"
            title={`ターミナルを開く（${run.worktree_path || project.repo_path}）`}
            onClick={() => onOpenTerminal(terminalTargetOf(run, project))}
          />
        )}
        {run.archived_at && <span className="archived-chip">アーカイブ済み</span>}
        <span className="spacer" />
        <span className={`run-state state-${waiting ? "waiting" : run.status}`}>
          <RunStatusIcon run={run} waiting={waiting} />
          {RUN_STATUS_LABELS[waiting ? "waiting" : run.status]}
        </span>
      </div>
      <div className="run-sub muted small">
        {/* どのプロジェクトのチャットかが一目でわかるよう、サイドバーと同じ色のバッジにする（押すとそのプロジェクトのカンバン） */}
        {project && <ProjectChip id={project.id} name={project.name} linked />}
        {/* 作業場所（ワークツリー）で作業しているチャット */}
        <WorktreeChip run={run} />
        {run.num_turns > 0 && <span>{run.num_turns} ターン</span>}
        {run.cost_usd > 0 && <span title="サブスクリプション利用時も API 料金に換算した参考値">API 換算 ${run.cost_usd.toFixed(2)}</span>}
      </div>
    </header>
  );
}
