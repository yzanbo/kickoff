import { Archive, Plus } from "lucide-react";
import type { Run, RunGroup } from "../../../../core/types";
import { useChatSelection } from "./chatSelection";
import { GroupToggle } from "./GroupToggle";
import { ProjectSlides } from "./ProjectSlides";
import { ProjectStack } from "./ProjectStack";
import { SelectionBar } from "./SelectionBar";
import { useProjectNav } from "./useProjectNav";

interface Props {
  /** プロジェクトごとのチャット（アーカイブしたものも含む）とグループ（useSidebarData） */
  runs: Record<number, Run[]>;
  groups: Record<number, RunGroup[]>;
  onNewProject: () => void;
}

/**
 * Zen Browser のワークスペースのような、プロジェクトごとのサイドバー。
 * 1 ページ = 1 プロジェクトのチャット一覧で、横スワイプ・下部のアイコン・ショートカットで切り替える（ProjectSlides）か、
 * 縦に並べる（ProjectStack）。状態と操作は useProjectNav
 */
export function ProjectNav({ runs, groups, onNewProject }: Props) {
  const nav = useProjectNav(runs);
  const { projects, archived, ordered, waitingOnly, setWaitingOnly, showArchived, setShowArchived } = nav;
  // 複数選んだチャットをまとめて操作する欄（選んでいるときだけ、下の行の上に出す）。hooks は、下の早い return より前に呼ぶ
  const selection = useChatSelection();

  if (projects.length === 0) {
    return (
      <div className="workspace-empty">
        <button className="sidebar-new" onClick={onNewProject}>
          <Plus size={14} /> 新しいプロジェクト
        </button>
      </div>
    );
  }

  /** 縦並びの、しまったプロジェクトのまとまりの見出し（サイドバーのアーカイブ済みのチャットと同じ形） */
  const toggleArchived = () => setShowArchived(!showArchived);
  const archivedHead = archived.length > 0 && !waitingOnly && (
    <div className="custom-group-head ungrouped archived-projects-head">
      <GroupToggle open={showArchived} onToggle={toggleArchived} icon={Archive} iconSize={12} />
      <button className="custom-group-name ungrouped-name" onClick={toggleArchived}>
        アーカイブしたプロジェクト
      </button>
      <span className="custom-group-count">{archived.length}</span>
    </div>
  );

  /** 自分待ちだけを出していて、ひとつもないとき */
  const waitingEmpty = waitingOnly && ordered.length === 0 && (
    <div className="waiting-empty">
      <p className="chat-search-empty">自分待ちのチャットはありません</p>
      <button className="chat-row ghost" onClick={() => setWaitingOnly(false)}>
        すべてのチャットを表示
      </button>
    </div>
  );

  const selectionBar = selection && <SelectionBar selection={selection} runs={runs} groups={groups} />;

  if (nav.layout === "stack") {
    return <ProjectStack nav={nav} runs={runs} groups={groups} onNewProject={onNewProject} archivedHead={archivedHead} waitingEmpty={waitingEmpty} selectionBar={selectionBar} />;
  }
  return <ProjectSlides nav={nav} runs={runs} groups={groups} onNewProject={onNewProject} waitingEmpty={waitingEmpty} selectionBar={selectionBar} />;
}
