// notes がプロジェクトの画面の表（projectViews）に出す画面の中身
import type { ProjectViewContext } from "@/features/projects/ui";
import type { ChatSideAddProps } from "@/features/chatPanel/ui";
import { noteTab, openTab } from "@/features/panel/ui";
import { NoteTab } from "./NoteTab";
import { RecentNoteItems } from "./NoteMenuItems";
import { sideNoteScope } from "./notePanel";

/** 別のプロジェクトを読み込んでいる途中は、URL で来たノートを渡さない。右サイドバーは、真ん中のノートのタブとは別の右のタブの欄 */
export const NotesViewPage = ({ place, project, stale, openNote, openNoteLine, takeRequest }: ProjectViewContext) => (
  <NoteTab
    key={project.id}
    projectId={project.id}
    scope={place === "rightSidebar" ? sideNoteScope(project.id) : undefined}
    openNote={stale ? undefined : openNote}
    openNoteLine={openNoteLine}
    onOpenedNote={takeRequest}
  />
);

/** チャットの右の欄の「＋ ▾」のノート: 最近変えたノートを横に並べ、選ぶとその右の欄のノートのタブで開く */
export const RecentNotesSubmenu = ({ chat, panelKey }: ChatSideAddProps) => (
  <RecentNoteItems projectId={chat.project_id} onPick={(path) => openTab(panelKey, noteTab({ chatId: chat.id, projectId: chat.project_id, path }))} />
);
