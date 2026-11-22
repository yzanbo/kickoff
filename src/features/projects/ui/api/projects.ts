import type { ImportProjectBody, NewProjectBody, ProjectPatch, ProjectRepoPathBody } from "@shared/foundation/apiTypes";
import type { FolderInspection, Project } from "@shared/projects/types";
import type { TrashedResult } from "@shared/trash/types";
import { request, withQuery } from "@/foundation/ui/api/http";

/** プロジェクト（作成・取り込み・変更・フォルダの変更・git の管理を始める・並び順・ゴミ箱へ入れる）と、取り込む前のフォルダの点検（取り決めは @shared/projects/contract.ts） */
export const projectsApi = {
  /** すべてのプロジェクト（画面はプロジェクトの店 stores/projects.ts で 1 回だけ読み、あとは知らせで直す） */
  projects: () => request<Project[]>("GET", "/api/projects"),
  createProject: (body: NewProjectBody) => request<Project>("POST", "/api/projects", body),
  importProject: (body: ImportProjectBody) => request<Project>("POST", "/api/projects/import", body),
  /** 既存のフォルダの点検（取り込みのダイアログで、取り込む前に見せる） */
  inspectWorkspace: (path: string) => request<FolderInspection>("GET", withQuery("/api/workspace/inspect", { path })),
  updateProject: (id: number, patch: ProjectPatch) => request<Project>("PATCH", `/api/projects/${id}`, patch),
  /** プロジェクトのフォルダ（本体）を変える（取り込みと同じ決まりで確かめる。ほかのプロジェクトのフォルダ・作業中のチャットがあれば 409） */
  setProjectRepoPath: (id: number, body: ProjectRepoPathBody) => request<Project>("PUT", `/api/projects/${id}/repo-path`, body),
  /** git で管理していないプロジェクトで、git の管理を始める（いまあるファイルで最初のコミットを作る。もう管理していれば 409） */
  initProjectGit: (id: number) => request<void>("POST", `/api/projects/${id}/git/init`),
  /** プロジェクトを Kickoff のゴミ箱へ入れる（チャットなどごと。3 日は戻せる）。入れたゴミ箱の ID を返す */
  deleteProject: (id: number) => request<TrashedResult>("DELETE", `/api/projects/${id}`),
  /** サイドバーでのプロジェクトの並び順（並べたあとの一覧が返る） */
  reorderProjects: (ids: number[]) => request<Project[]>("PUT", "/api/projects/order", { ids }),
};
