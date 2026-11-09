import { ArchiveRestore, Settings } from "lucide-react";
import { IconButton } from "@/ui/IconButton";
import { ToneChip } from "@/ui/ToneChip";
import { confirmRestoreProject } from "@/features/project/projectOrder";
import type { ProjectTab } from "@/app/router";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { ProjectTabs, useProjectTabsLayout, type TabRefreshing } from "./ProjectTabs";
import { StateStats } from "./StateStats";
import { ActiveChatsButton } from "@/features/palette/ActiveChatsButton";
import { useChatStates } from "@/app/chatStatesContext";
import { chatStateOf } from "@/features/chat/chatState";
import { waitingChats } from "@/features/chatList/chatListFlags";
import type { ProjectData } from "./useProjectData";

/**
 * プロジェクト画面の見出し: 名前（プロジェクトの切り替え）・設定の歯車・しまったものを戻す・状態ごとのチャット数・このプロジェクトの作業中・待ちのチャットの一覧（⌘⇧A）と、
 * タブの列（チャットの件数、変更は変更のあるファイルの数 changeCount。左に縦並びにする設定のときは、見出しには出さない）
 */
export function ProjectHeader({
  data,
  tab,
  changeCount,
  refreshing,
  onEdit,
}: {
  data: ProjectData;
  tab: ProjectTab;
  changeCount: number;
  refreshing: TabRefreshing;
  onEdit: () => void;
}) {
  const { project, chats } = data;
  const [layout] = useProjectTabsLayout();
  // 要対応（回答待ち・未読。サイドバーの「要対応」と同じ数え方）の数を、一覧のボタンの右上に出す
  const { pending } = useChatStates();
  const waiting = waitingChats(chats, pending);
  const urgent = waiting.some((chat) => chatStateOf(chat, pending) === "needs_input");
  return (
  <header className="page-header project-header">
    <div className="project-title-row">
      <h1>
        <ProjectSwitcher project={project} tab={tab} />
      </h1>
      {/* プロジェクトの設定（名前・既定の設定などの編集）。左下のアプリの設定と同じ歯車 */}
      <IconButton icon={Settings} label="プロジェクトの設定" title="プロジェクトの設定（名前・既定の設定などを編集）" className="project-edit-button" onClick={onEdit} />
      {/* しまった（アーカイブした）プロジェクト: サイドバーに出ないので、ここから戻せるようにする */}
      {project.archived_at && (
        <button
          className="btn btn-sm"
          title="アーカイブから戻す（サイドバー・全プロジェクトの画面に出す）"
          onClick={() => void confirmRestoreProject(project)}
        >
          <ArchiveRestore size={13} /> 戻す
        </button>
      )}
      <div className="project-stats">
        {project.archived_at && <ToneChip label="アーカイブ済み" />}
        <StateStats chats={chats} />
        {/* このプロジェクトに絞り込んだ ⌘⇧A の一覧（状態ごとの数が 0 でも出す。右上に要対応の数。利用者の依頼） */}
        <ActiveChatsButton project={project} waiting={{ count: waiting.length, urgent }} />
      </div>
    </div>
    {layout === "top" && (
      <div className="project-tabs-row">
        <ProjectTabs projectId={project.id} tab={tab} chats={chats} changeCount={changeCount} refreshing={refreshing} />
      </div>
    )}
  </header>
  );
}
