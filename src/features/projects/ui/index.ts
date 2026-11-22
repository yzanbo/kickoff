// projects の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

export { trySideOpen } from "./rightSidebar/sideOpenRequests";
export { useProjects } from "./stores/projects";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const projectsSettings = { listOrder: storage.settings.listOrder, sideView: storage.settings.sideView } as const;
