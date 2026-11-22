// プロジェクトの受け口（取り決めは @shared/projects/contract.ts、手順は service.ts）
import { z } from "zod";
import { projectContract } from "@shared/projects/contract";
import type { Project } from "@shared/projects/types";
import { PROVIDER_IDS } from "@shared/settings/types";
import { PROJECT_HUES } from "@shared/projects/colors";
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTags } from "@shared/projects/tags";
import { implement, type Param } from "@/foundation/core/http/implement";
import { idsBody } from "@/foundation/core/http/zodParts";
import { ABSOLUTE_FOLDER, isAbsoluteFolder, compactPrompt, projectDescription, projectName, projectProviderDefaultsSchema } from "@/foundation/core/http/schemas";
import { changeProjectFolder, createProject, importProject, inspectFolder, startProjectGit, trashProjectById, updateProject, type ProjectsCtx } from "./service";

// 新しいプロジェクト・取り込むプロジェクトのノートのフォルダ（省けば初めてノートを使ったときにプロジェクト名から決める）
const noteDirFields = {
  note_folder: z.string().trim().min(1).max(200).optional(),
  note_dir: z.string().trim().min(1).max(1000).refine(isAbsoluteFolder, ABSOLUTE_FOLDER).optional(),
};

// 新しいプロジェクト（description は README の「アイデア」にも書く）
const newProjectSchema = z.object({
  ...noteDirFields,
  name: projectName,
  description: projectDescription.default(null),
  parent_dir: z.string().trim().min(1),
  folder_name: z.string().trim().min(1).max(100),
  provider: z.enum(PROVIDER_IDS).optional(),
  init_git: z.boolean().default(true),
});

const importProjectSchema = z.object({
  ...noteDirFields,
  path: z.string().trim().min(1),
  name: projectName,
  description: projectDescription.default(null),
  init_git: z.boolean().default(false),
  provider: z.enum(PROVIDER_IDS).optional(),
});

const inspectQuery = z.object({ path: z.string().trim().min(1).max(1000) });

const repoPathSchema = z.object({
  path: z.string().trim().min(1).max(1000),
  init_git: z.boolean().default(false),
});

const projectPatchSchema = z
  .object({
    name: projectName,
    description: projectDescription,
    provider: z.enum(PROVIDER_IDS),
    // プロジェクトの色（色の一覧から選ぶ）
    hue: z.number().int().refine((h) => (PROJECT_HUES as readonly number[]).includes(h), "色は一覧から選んでください"),
    // タグ（送った内容で置き換える。前後の空白・重複は除く）
    tags: z
      .array(z.string().trim().min(1).max(MAX_TAG_LENGTH))
      .max(MAX_TAGS * 5)
      .transform(normalizeTags)
      .refine((tags) => tags.length <= MAX_TAGS, `タグは ${MAX_TAGS} 個までです`),
    // 上に固定する・しまう（アーカイブ）
    pinned: z.boolean(),
    archived: z.boolean(),
    // 参照資料（パスだけ送ればよい。種類はサーバーで調べる）
    reference_paths: z.array(z.object({ path: z.string().trim().min(1).max(1000) })).max(50),
    // AI ごとの既定（送った内容で置き換える。書いていない項目はアプリ全体のその AI の既定に従う）
    provider_chat_defaults: projectProviderDefaultsSchema,
    // ノートのフォルダを、このプロジェクトだけ別の場所にする（null なら親フォルダの下）
    note_dir: z.string().trim().min(1).max(1000).refine(isAbsoluteFolder, ABSOLUTE_FOLDER).nullable(),
    // このプロジェクトの圧縮前指示（null ならなし）
    pre_compact_prompt: compactPrompt,
    post_compact_prompt: compactPrompt,
    // このプロジェクトの圧縮前指示・圧縮後指示を送るか（オフでも文は残す）
    pre_compact_enabled: z.boolean(),
    post_compact_enabled: z.boolean(),
    // GitHub で使うアカウント・連携先の remote（null なら gh で有効なアカウント・自動）と、ワークツリーの PR を見張るか
    github_account: z.string().trim().min(1).max(100).nullable(),
    github_remote: z.string().trim().min(1).max(255).nullable(),
    pr_watch: z.boolean(),
    ci_watch: z.boolean(),
  })
  .partial();

/** プロジェクトの受け口（:projectId の引き当ては ProjectsApi.param） */
export function projectRoutes(ctx: ProjectsCtx, projectParam: Param<Project>) {
  return implement(projectContract, {
    context: { projectId: projectParam },
    "GET /api/projects": { run: () => ctx.projects.list() },
    "POST /api/projects": { body: newProjectSchema, run: ({ body }) => createProject(ctx, body) },
    "GET /api/workspace/inspect": { query: inspectQuery, run: ({ query }) => inspectFolder(ctx, query.path) },
    "POST /api/projects/import": { body: importProjectSchema, run: ({ body }) => importProject(ctx, body) },
    "PATCH /api/projects/:projectId": { body: projectPatchSchema, run: ({ projectId, body }) => updateProject(ctx, projectId, body) },
    "PUT /api/projects/:projectId/repo-path": { body: repoPathSchema, run: ({ projectId, body }) => changeProjectFolder(ctx, projectId, body) },
    "POST /api/projects/:projectId/git/init": { run: ({ projectId }) => startProjectGit(ctx, projectId) },
    "PUT /api/projects/order": { body: idsBody, run: ({ body }) => ctx.projects.reorder(body.ids) },
    "DELETE /api/projects/:projectId": { run: ({ projectId }) => trashProjectById(ctx, projectId) },
  });
}
