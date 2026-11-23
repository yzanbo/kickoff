// projects の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

export { trySideOpen } from "./rightSidebar/sideOpenRequests";
export { isSideViewShown, showSideView } from "./rightSidebar/sideView";
export { addProject, currentProjectsIndex, useProjects } from "./stores/projects";
export { sidebarOrder } from "./projectOrder";
export { ProjectPickFlyout } from "./ProjectPickFlyout";
export { InspectionList } from "./InspectionList";
export { ACTIVE_CHATS_LABEL } from "./ProjectMenu";
export { ProjectMark } from "./ProjectMark";
export { useProjectHue } from "./projectColor";
export { projectViewTab } from "./chatSideView";
export { canShowProjectView, projectViewOf, projectViews } from "./projectViews";
export { projectHeaderStats, type ProjectHeaderStat } from "./projectHeaderStats";
export type { ProjectViewBadge, ProjectViewBadgeProps, ProjectViewContext, ProjectViewDef } from "./projectViews";
export { openNewProject, openNoProjectsGuide } from "./new/openNewProject";
export { useEditedProject } from "./settings/editedProject";
export { projectGit, type ProjectGit } from "./projectGit";
export { projectInView, useFallbackProject, useExistingProject } from "./currentProject";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const projectsSettings = { listOrder: storage.settings.listOrder, sideView: storage.settings.sideView } as const;
