import { Archive, Plus } from "lucide-react";
import type { Chat, ChatGroup } from "@shared/types";
import { tagLabel } from "@/features/project/projectTagFilter";
import { useChatSelection } from "./chatSelection";
import { GroupToggle } from "@/ui/GroupToggle";
import { ProjectSlides } from "./ProjectSlides";
import { ProjectStack } from "./ProjectStack";
import { SelectionBar } from "./SelectionBar";
import { useProjectNav } from "./useProjectNav";

interface Props {
  /** プロジェクトごとのチャット（アーカイブ済みは一覧の下に出すときだけ含む。stores/chats.ts）とグループ（useSidebarData） */
  chats: Record<number, Chat[]>;
  groups: Record<number, ChatGroup[]>;
  onNewProject: () => void;
}

/**
 * Zen Browser のワークスペースのような、プロジェクトごとのサイドバー。
 * 1 ページ = 1 プロジェクトのチャット一覧で、横スワイプ・下部のアイコン・ショートカットで切り替える（ProjectSlides）か、
 * 縦に並べる（ProjectStack）。状態と操作は useProjectNav。
 * タグで絞り込んで合うプロジェクトがないとき・自分待ちがないときは、その旨と戻すボタンを出す（waitingEmpty）
 */
export function ProjectNav({ chats, groups, onNewProject }: Props) {
  const nav = useProjectNav(chats);
  const { projects, archived, ordered, visible, waitingOnly, setWaitingOnly, tagFilter, showArchived, setShowArchived } = nav;
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

  /** タグで絞り込んで、合うプロジェクトがひとつもないとき（自分待ちより先に知らせる） */
  const tagEmpty = tagFilter.active && visible.length === 0 && ordered.length === 0;
  const tagEmptyNotice = tagEmpty && (
    <div className="waiting-empty">
      <p className="chat-search-empty">タグ「{tagFilter.selected.map(tagLabel).join("、")}」に合うプロジェクトはありません</p>
      <button className="chat-row ghost" onClick={tagFilter.clear}>
        絞り込みを外す
      </button>
    </div>
  );

  /** 自分待ちだけを出していて、ひとつもないとき */
  const waitingEmpty = tagEmptyNotice || (waitingOnly && ordered.length === 0 && (
    <div className="waiting-empty">
      <p className="chat-search-empty">自分待ちのチャットはありません</p>
      <button className="chat-row ghost" onClick={() => setWaitingOnly(false)}>
        すべてのチャットを表示
      </button>
    </div>
  ));

  const selectionBar = selection && <SelectionBar selection={selection} chats={chats} groups={groups} />;

  if (nav.layout === "stack") {
    return <ProjectStack nav={nav} chats={chats} groups={groups} onNewProject={onNewProject} archivedHead={archivedHead} waitingEmpty={waitingEmpty} selectionBar={selectionBar} />;
  }
  return <ProjectSlides nav={nav} chats={chats} groups={groups} onNewProject={onNewProject} waitingEmpty={waitingEmpty} selectionBar={selectionBar} />;
}
