import { Archive, Plus } from "lucide-react";
import { cx } from "@/lib/cx";
import type { Chat, ChatGroup } from "@shared/types";
import { tagLabel } from "@/features/project/projectTagFilter";
import { useChatSelection } from "./chatSelection";
import { FoldHead } from "@/ui/FoldHead";
import { ProjectSlides } from "./ProjectSlides";
import { ProjectStack } from "./ProjectStack";
import { SelectionBar } from "./SelectionBar";
import { useProjectNav } from "./useProjectNav";
import { WaitingInbox } from "./WaitingInbox";
import { waitingAxes } from "./waitingAxes";
import { ProjectListHead } from "./ProjectListHead";

interface Props {
  /** プロジェクトごとのチャット（アーカイブ済みは一覧の下に出すときだけ含む）とグループ（どちらも店 stores/ から） */
  chats: Record<number, Chat[]>;
  groups: Record<number, ChatGroup[]>;
  onNewProject: () => void;
}

/**
 * Zen Browser のワークスペースのような、プロジェクトごとのサイドバー。
 * 1 ページ = 1 プロジェクトのチャット一覧で、横スワイプ・下部のアイコン・ショートカットで切り替える（ProjectSlides）か、
 * 縦に並べる（ProjectStack）。状態と操作は useProjectNav。
 * タグで絞り込んで合うプロジェクトがないとき・要対応がないときは、その旨と戻すボタンを出す（waitingEmpty）
 */
export function ProjectNav({ chats, groups, onNewProject }: Props) {
  const nav = useProjectNav(chats);
  const { projects, archived, ordered, visible, waitingOnly, waitingView, filterByWaiting, setWaitingOnly, tagFilter, showArchived, setShowArchived } = nav;
  // 複数選んだチャットをまとめて操作する欄（選んでいるときだけ、下の行の上に出す）。hooks は、下の早い return より前に呼ぶ
  const selection = useChatSelection();

  if (projects.length === 0) {
    return (
      <div className="workspace-empty">
        <p className="workspace-empty-text">プロジェクトがまだありません。作ると、ここにプロジェクトとチャットが並び、答えを待っているものは「要対応」に集まります。</p>
        <button className="sidebar-new" onClick={onNewProject}>
          <Plus size={14} /> 新しいプロジェクト
        </button>
      </div>
    );
  }

  /** 縦並びの、しまったプロジェクトのまとまりの見出し（サイドバーのアーカイブ済みのチャットと同じ形） */
  const toggleArchived = () => setShowArchived(!showArchived);
  const archivedHead = archived.length > 0 && !waitingOnly && (
    <FoldHead look="row" className="archived-projects-head" icon={Archive} open={showArchived} onToggle={toggleArchived} label="アーカイブしたプロジェクト" count={archived.length} />
  );

  /** タグで絞り込んで、合うプロジェクトがひとつもないとき（要対応より先に知らせる） */
  const tagEmpty = tagFilter.active && visible.length === 0 && ordered.length === 0;
  const tagEmptyNotice = tagEmpty && (
    <div className="waiting-empty">
      <p className="chat-search-empty">タグ「{tagFilter.selected.map(tagLabel).join("、")}」に合うプロジェクトはありません</p>
      <button className="chat-row ghost" onClick={tagFilter.clear}>
        絞り込みを外す
      </button>
    </div>
  );

  /** 要対応でプロジェクトを絞っていて、ひとつもないとき */
  const waitingEmpty = tagEmptyNotice || (filterByWaiting && ordered.length === 0 && (
    <div className="waiting-empty">
      <p className="chat-search-empty">要対応のチャットはありません</p>
      <button className="chat-row ghost" onClick={() => setWaitingOnly(false)}>
        すべてのチャットを表示
      </button>
    </div>
  ));

  const selectionBar = selection && <SelectionBar selection={selection} chats={chats} groups={groups} />;

  // 要対応の表示の出し方と並べ方（要対応だけ × プロジェクト別は、プロジェクトの一覧そのものを絞る filterByWaiting）
  const { scope: waitingScope, order: waitingOrder } = waitingAxes(waitingView);
  // 要対応だけ × 状態順: プロジェクトの一覧の代わりに、待っているチャットだけをプロジェクトをまたいで状態順に並べる
  if (waitingOnly && waitingScope === "only" && waitingOrder === "status") {
    return (
      <div className={cx("workspaces", nav.compact && "compact")}>
        <ProjectListHead {...nav.head} />
        <div className="workspace-stack">
          {tagEmptyNotice || <WaitingInbox chats={chats} variant="list" order="status" />}
        </div>
        {selectionBar}
      </div>
    );
  }
  // 一覧の上に: 一覧の上に待っているチャットのまとまり（並べ方は状態順 / プロジェクト別）を置き、その下はすべてのプロジェクト（プロジェクト内の上には WorkspacePage が置く）
  const topInbox = waitingOnly && waitingScope === "top" && !tagEmpty ? <WaitingInbox chats={chats} variant="top" order={waitingOrder} /> : null;
  if (nav.layout === "stack") {
    return <ProjectStack nav={nav} chats={chats} groups={groups} onNewProject={onNewProject} archivedHead={archivedHead} waitingEmpty={waitingEmpty} topInbox={topInbox} selectionBar={selectionBar} />;
  }
  return <ProjectSlides nav={nav} chats={chats} groups={groups} onNewProject={onNewProject} waitingEmpty={waitingEmpty} topInbox={topInbox} selectionBar={selectionBar} />;
}
