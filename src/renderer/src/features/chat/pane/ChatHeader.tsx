import { Folder } from "lucide-react";
import type { ReactNode } from "react";
import type { Project, Run } from "@shared/types";
import { useGroupName } from "@/features/group/groupNames";
import { ProjectChip } from "@/features/project/ProjectChip";
import { WorktreeChip } from "@/features/worktree/WorktreeChip";

/**
 * チャットの見出し: プロジェクト・作業場所・グループのバッジ、右に道具（検索・横幅。アーカイブはタブ・サイドバーの右クリックから）・ターン数と API 換算。
 * 名前・閉じる・状態の印（作業中・回答待ちなど）はパネルのタブにあるので、ここには出さない（名前はタブのダブルクリックで変える）
 */
export function RunHeader({
  run,
  project,
  tools,
}: {
  run: Run;
  project?: Project;
  /** 右の道具の列の先頭に置くもの（チャットの中の検索） */
  tools?: ReactNode;
}) {
  const groupName = useGroupName(run.project_id, run.group_id);
  return (
    <header className="run-header">
      <div className="run-title-row">
        {/* どのプロジェクト・作業場所のチャットか（サイドバーと同じ色のバッジ。押すとそのプロジェクトのカンバン） */}
        <span className="run-sub muted small">
          {project && <ProjectChip id={project.id} name={project.name} linked />}
          <WorktreeChip run={run} />
          {groupName && (
            <span className="run-group-chip" title={`グループ「${groupName}」のチャット`}>
              <Folder size={11} aria-hidden />
              {groupName}
            </span>
          )}
        </span>
        {run.archived_at && <span className="archived-chip">アーカイブ済み</span>}
        <span className="spacer" />
        {/* 作業場所の道具（右に寄せ、名前・バッジと分ける。アプリの中のターミナルはパネルのタブの列のボタンから） */}
        <span className="run-tools">
        {/* アーカイブのボタンは置かない（タブ・サイドバーの行の右クリックから、確かめてからアーカイブする） */}
        {tools}
        </span>
        {/* ターン数と費用（狭いときは隠す） */}
        {(run.num_turns > 0 || run.cost_usd > 0) && (
          <span className="run-meta muted small">
            {run.num_turns > 0 && <span>{run.num_turns} ターン</span>}
            {run.cost_usd > 0 && <span title="サブスクリプション利用時も API 料金に換算した参考値">API 換算 ${run.cost_usd.toFixed(2)}</span>}
          </span>
        )}
      </div>
    </header>
  );
}
