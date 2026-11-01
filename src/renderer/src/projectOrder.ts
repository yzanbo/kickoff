import type { ProjectSummary } from "../../core/types";

/** サイドバーと同じ並び（ドラッグで並べ替えた順。同じなら作成順） */
export const sidebarOrder = (projects: ProjectSummary[]) => [...projects].sort((a, b) => a.position - b.position || a.id - b.id);
