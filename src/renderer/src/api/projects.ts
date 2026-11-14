import type { FolderInspection, ImportProjectBody, NewProjectBody, Project, ProjectGitHub, ProjectPatch, ProjectRepoPathBody, TrashedResult } from "@shared/types";
import { request, withQuery } from "./http";

/** プロジェクト（作成・取り込み・変更・フォルダの変更・git の管理を始める・並び順・管理から外す）と、取り込む前のフォルダの点検（コアの routes/projects.ts） */
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
  /** GitHub の連携（設定の「GitHub」: gh に入っているアカウント・GitHub の remote・自動の連携先・いまの連携先） */
  projectGitHub: (id: number) => request<ProjectGitHub>("GET", `/api/projects/${id}/github`),
  /** Kickoff の管理から外す（フォルダやリポジトリは消さない） */
  /** プロジェクトを Kickoff のゴミ箱へ入れる（チャットなどごと。3 日は戻せる）。入れたゴミ箱の ID を返す */
  deleteProject: (id: number) => request<TrashedResult>("DELETE", `/api/projects/${id}`),
  /** サイドバーでのプロジェクトの並び順（並べたあとの一覧が返る） */
  reorderProjects: (ids: number[]) => request<Project[]>("PUT", "/api/projects/order", { ids }),
};
