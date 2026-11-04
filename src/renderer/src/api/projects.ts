import type { FolderInspection, ImportProjectBody, NewProjectBody, Project, ProjectPatch } from "@shared/types";
import { request, withQuery } from "./http";

/** プロジェクト（作成・取り込み・変更・並び順・管理から外す）と、取り込む前のフォルダの点検（コアの routes/projects.ts） */
export const projectsApi = {
  /** すべてのプロジェクト（画面はプロジェクトの店 stores/projects.ts で 1 回だけ読み、あとは知らせで直す） */
  projects: () => request<Project[]>("GET", "/api/projects"),
  createProject: (body: NewProjectBody) => request<Project>("POST", "/api/projects", body),
  importProject: (body: ImportProjectBody) => request<Project>("POST", "/api/projects/import", body),
  /** 既存のフォルダの点検（取り込みのダイアログで、取り込む前に見せる） */
  inspectWorkspace: (path: string) => request<FolderInspection>("GET", withQuery("/api/workspace/inspect", { path })),
  updateProject: (id: number, patch: ProjectPatch) => request<Project>("PATCH", `/api/projects/${id}`, patch),
  /** Kickoff の管理から外す（フォルダやリポジトリは消さない） */
  deleteProject: (id: number) => request<void>("DELETE", `/api/projects/${id}`),
  /** サイドバーでのプロジェクトの並び順（並べたあとの一覧が返る） */
  reorderProjects: (ids: number[]) => request<Project[]>("PUT", "/api/projects/order", { ids }),
};
