import { Archive, ArchiveRestore, ExternalLink, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import type { Project, Run } from "../../../../core/types";
import { CHAT_TITLE_MAX, chatTitle } from "../../chatTitle";
import { useRunRename } from "../../hooks/useRunRename";
import { toggleArchiveRunNow } from "../../runActions";
import { useExternalTerminal } from "../../externalTerminal";
import { CloseButton, IconButton } from "../IconButton";
import { InlineName } from "../InlineName";
import { ProjectChip } from "../ProjectChip";
import { RUN_STATUS_LABELS, RunStatusIcon } from "../RunStatus";
import { WorktreeChip } from "../WorktreeChip";

/**
 * チャットの見出し: 閉じる・名前（ダブルクリックか鉛筆でその場で変更）・アーカイブ・作業場所のターミナル・状態と、
 * その下にプロジェクト・作業場所・ターン数・API 換算の行。waiting は確認（回答待ち）があるか
 */
export function RunHeader({
  run,
  project,
  waiting,
  tools,
  onClose,
}: {
  run: Run;
  project?: Project;
  waiting: boolean;
  /** 右の道具の列の先頭に置くもの（チャットの中の検索・発言の目次） */
  tools?: ReactNode;
  onClose: () => void;
}) {
  const rename = useRunRename();
  const external = useExternalTerminal();
  const editor = rename.editorFor(run);
  return (
    <header className="run-header">
      <div className="run-title-row">
        <CloseButton label="パネルを閉じる" title="閉じる（Esc）" size={15} onClick={onClose} />
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
        {/* どのプロジェクト・作業場所のチャットか（サイドバーと同じ色のバッジ。押すとそのプロジェクトのカンバン）。名前と同じ行に置き、見出しを 1 行に収める */}
        <span className="run-sub muted small">
          {project && <ProjectChip id={project.id} name={project.name} linked />}
          <WorktreeChip run={run} />
        </span>
        {run.archived_at && <span className="archived-chip">アーカイブ済み</span>}
        <span className="spacer" />
        {/* 作業場所の道具（右に寄せ、名前・バッジと分ける。アプリの中のターミナルはパネルのタブの列のボタンから） */}
        <span className="run-tools">
        {tools}
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
          <RunStatusIcon run={run} waiting={waiting} />
          {RUN_STATUS_LABELS[waiting ? "waiting" : run.status]}
        </span>
      </div>
    </header>
  );
}
