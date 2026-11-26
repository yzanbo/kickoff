// projects の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

export { trySideOpen } from "./rightSidebar/sideOpenRequests";
export { isSideViewShown, showSideView } from "./rightSidebar/sideView";
export { addProject, currentProjectsIndex, useProjects } from "./stores/projects";
export { reorderableIds } from "./projectOrder";
export { ProjectPickFlyout } from "./ProjectPickFlyout";
export { InspectionList } from "./InspectionList";
export { noteOverlapLines } from "./folderOverlaps";
export { ACTIVE_CHATS_LABEL } from "./ProjectMenu";
export { ProjectMark } from "./ProjectMark";
export { useProjectHue } from "./projectColor";
export { projectViewTab } from "./chatSideView";
export { canShowProjectView, projectViewOf, projectViews } from "./projectViews";
export { projectHeaderStats, type ProjectHeaderStat } from "./projectHeaderStats";
export type { ProjectViewBadge, ProjectViewBadgeProps, ProjectViewContext, ProjectViewDef } from "./projectViews";
export { openNewProject, openNoProjectsGuide } from "./new/openNewProject";
export { defineNewProjectAfter, newProjectAfters } from "./new/afterNewProject";
export { projectChats, projectGroups, type ProjectChat, type ProjectChats, type ProjectGroups } from "./projectChats";
export { newProjectNoteField, type NewProjectNoteFieldProps } from "./new/NoteDirField";
export { useEditedProject } from "./settings/editedProject";
export { projectGit, type ProjectGit } from "./projectGit";
export { isCommonProjectId, projectInView, useFallbackProject, useExistingProject, useIsCommonProject } from "./currentProject";
export { firstTargetOf } from "./projectTargets";
export { ProjectPicker } from "./ProjectPicker";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const projectsSettings = { listOrder: storage.settings.listOrder, sideView: storage.settings.sideView } as const;
export { projectsApi } from "./api/projects";
export { GitInitNotice } from "./GitInitNotice";
export { ProjectChip } from "./ProjectChip";
export { useProjectMenu } from "./ProjectMenu";
export { ProjectTags } from "./ProjectTags";
export { NoProjectsWelcome } from "./ProjectsEmpty";
export { TagFilterNotice } from "./TagFilterNotice";
export { loadCurrentProject, saveCurrentProject } from "./currentProject";
export { ProjectSwitcher } from "./page/ProjectSwitcher";
export { useChatPlacement } from "./page/chatPlacement";
export { COMMON_TONE, hueStyle, initialOf, projectHue } from "./projectColor";
export { changeProject, confirmRestoreProject } from "./projectOrder";
export { tagLabel, useProjectTagFilter } from "./projectTagFilter";
export { deleteTag, renameTag } from "./tagActions";
export { useVisibleProjects } from "./useVisibleProjects";
