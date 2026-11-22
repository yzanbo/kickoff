// プロジェクトの取り決め（受け口は src/features/projects/core/routes.ts）。GitHub の連携の様子（GET /api/projects/:projectId/github）は github の機能の口
import { empty, route, type Contract } from "@shared/foundation/contract";
import type { ImportProjectBody, NewProjectBody, ProjectPatch, ProjectRepoPathBody } from "@shared/foundation/apiTypes";
import type { FolderInspection, Project } from "./types";

export const projectContract = {
  /** すべてのプロジェクト（ゴミ箱のものは出さない） */
  "GET /api/projects": route<never, Project[]>({ access: "device" }),
  /** 新しいプロジェクト（フォルダを作る。ほかのプロジェクトのフォルダなら 409） */
  "POST /api/projects": route<NewProjectBody, Project>({ status: 201 }),
  /** 既存のフォルダの点検（取り込みのダイアログで、取り込む前に見せる。registered_project_id はそのフォルダのプロジェクト） */
  "GET /api/workspace/inspect": route<never, FolderInspection, { path: string }>(),
  /** 既存のフォルダを取り込む（ほかのプロジェクトのフォルダなら 409） */
  "POST /api/projects/import": route<ImportProjectBody, Project>({ status: 201 }),
  /** 書いた項目だけ変える（変えたあとのプロジェクト） */
  "PATCH /api/projects/:projectId": route<ProjectPatch, Project>(),
  /** 本体のフォルダを変える（ほかのプロジェクトのフォルダ・作業中のチャットがあれば 409） */
  "PUT /api/projects/:projectId/repo-path": route<ProjectRepoPathBody, Project>(),
  /** git の管理を始める（もう管理している・作業中のチャットがあれば 409） */
  "POST /api/projects/:projectId/git/init": empty(),
  /** ids の順に並べ直す（並べたあとの一覧） */
  "PUT /api/projects/order": route<{ ids: number[] }, Project[]>(),
  /** Kickoff のゴミ箱へ入れる（作業中のチャットがあれば 409。入れたゴミ箱の ID） */
  "DELETE /api/projects/:projectId": route<never, { trash_id: string }>(),
} as const satisfies Contract;
