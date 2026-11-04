import fs from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import { z } from "zod";
import { expandHome } from "../../system/paths.js";
import type { ServerDeps } from "../server.js";
import { EFFORT_LEVELS, PERMISSION_CHOICES, PROVIDER_IDS, type Project, type ProviderId } from "@shared/types";
import { createWorkspace, inspectWorkspace, prepareImportedWorkspace } from "../../git/workspace.js";
import { badRequest, HttpError, requireProject } from "./http.js";
import { PROJECT_HUES } from "@shared/project/colors";
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTags } from "@shared/project/tags";

const newProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  idea: z.string().max(10_000).default(""),
  parent_dir: z.string().trim().min(1),
  folder_name: z.string().trim().min(1).max(100),
  provider: z.enum(PROVIDER_IDS).optional(),
});

const importProjectSchema = z.object({
  path: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(10_000).default(""),
  init_git: z.boolean().default(false),
  provider: z.enum(PROVIDER_IDS).optional(),
});

const projectPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(10_000),
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
    references: z.array(z.object({ path: z.string().trim().min(1).max(1000) })).max(50),
    // 送った内容で置き換える（書いていない項目はアプリ全体の設定に従う）
    defaults: z
      .object({
        model: z.string().min(1).max(100),
        effort: z.enum(EFFORT_LEVELS).nullable(),
        permission: z.enum(PERMISSION_CHOICES),
        fastMode: z.boolean(),
      })
      .partial()
      .strict(),
  })
  .partial();

/** プロジェクト（作成・取り込み・設定の変更・並び順・管理から外す） */
export function projectRoutes(app: Hono, { store }: ServerDeps) {
  // 指定がなければ、設定の既定のプロバイダー
  const providerOf = (provider?: ProviderId) => provider ?? store.getSettings().defaultProvider;

  app.get("/api/projects", (c) => c.json(store.listProjects()));

  app.post("/api/projects", async (c) => {
    const input = newProjectSchema.parse(await c.req.json());
    const repoPath = await badRequest(() => createWorkspace({ parentDir: input.parent_dir, folderName: input.folder_name, name: input.name, idea: input.idea }));
    const project = store.createProject({ name: input.name, description: input.idea, repo_path: repoPath, provider: providerOf(input.provider) });
    store.updateSettings({ projectsDir: input.parent_dir });
    return c.json(project, 201);
  });

  // 既存フォルダの点検（取り込みダイアログでの事前表示用）
  app.get("/api/workspace/inspect", async (c) => {
    const { path } = z.object({ path: z.string().trim().min(1).max(1000) }).parse({ path: c.req.query("path") });
    const info = await inspectWorkspace(path);
    const registered = info.gitRoot ? store.findProjectByPath(info.gitRoot) : store.findProjectByPath(info.path);
    return c.json({ ...info, registered_project_id: registered?.id ?? null });
  });

  app.post("/api/projects/import", async (c) => {
    const input = importProjectSchema.parse(await c.req.json());
    const repoPath = await badRequest(() => prepareImportedWorkspace(input.path, input.init_git));
    const existing = store.findProjectByPath(repoPath);
    if (existing) throw new HttpError(409, `このフォルダは「${existing.name}」として登録済みです`);
    const project = store.createProject({ name: input.name, description: input.description, repo_path: repoPath, provider: providerOf(input.provider) });
    return c.json(project, 201);
  });

  app.get("/api/projects/:id", (c) => c.json(requireProject(store, c.req.param("id"))));

  app.patch("/api/projects/:id", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { references, archived, ...patch } = projectPatchSchema.parse(await c.req.json());
    return c.json(
      store.updateProject(project.id, {
        ...patch,
        ...(references ? { references: resolveReferences(references) } : {}),
        ...(archived === undefined ? {} : { archived_at: archived ? (project.archived_at ?? new Date().toISOString()) : null }),
      }),
    );
  });

  // サイドバーでのプロジェクトの並び順
  app.put("/api/projects/order", async (c) => {
    const { ids } = z.object({ ids: z.array(z.number().int()).max(500) }).parse(await c.req.json());
    store.reorderProjects(ids);
    return c.json({ ok: true });
  });

  // Kickoff の管理から外すだけで、フォルダやリポジトリは削除しない
  app.delete("/api/projects/:id", (c) => {
    const project = requireProject(store, c.req.param("id"));
    store.deleteProject(project.id);
    return c.json({ ok: true });
  });
}

/** 参照資料のパスを絶対パスにそろえ（~ はホームフォルダ）、フォルダかファイルかを調べる。見つからなければ 400 */
function resolveReferences(input: { path: string }[]): Project["references"] {
  const seen = new Set<string>();
  const out: Project["references"] = [];
  for (const { path: raw } of input) {
    const abs = path.resolve(expandHome(raw));
    if (seen.has(abs)) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      throw new HttpError(400, `見つかりません: ${raw}`);
    }
    seen.add(abs);
    out.push({ path: abs, kind: stat.isDirectory() ? "folder" : "file" });
  }
  return out;
}
