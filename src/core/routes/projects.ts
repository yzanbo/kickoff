import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";
import { z } from "zod";
import { normalizeScope } from "../scope.js";
import type { ServerDeps } from "../server.js";
import { EFFORT_LEVELS, PERMISSION_CHOICES, PHASES, PROVIDER_IDS, type Project } from "../types.js";
import { createWorkspace, inspectWorkspace, prepareImportedWorkspace } from "../workspace.js";
import { HttpError, requireProject } from "./http.js";

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
    test_command: z.string().max(500),
    deploy_instructions: z.string().max(10_000),
    auto_commit: z.boolean(),
    // 上に固定する・しまう（アーカイブ）
    pinned: z.boolean(),
    archived: z.boolean(),
    write_scopes: z
      .object({
        requirements: z.array(z.string().max(500)).max(20),
        schedule: z.array(z.string().max(500)).max(20),
      })
      .partial(),
    // 参照資料（パスだけ送ればよい。種類はサーバーで調べる）
    references: z.array(z.object({ path: z.string().trim().min(1).max(1000) })).max(50),
    // 送った内容で置き換える（書いていない項目はアプリ全体の設定に従う）
    defaults: z
      .object({
        model: z.string().min(1).max(100),
        effort: z.enum(EFFORT_LEVELS).nullable(),
        permission: z.enum(PERMISSION_CHOICES),
        fastMode: z.boolean(),
        section: z.enum(PHASES),
      })
      .partial()
      .strict(),
  })
  .partial();

/** プロジェクト（作成・取り込み・設定の変更・並び順・管理から外す） */
export function projectRoutes(app: Hono, { store }: ServerDeps) {
  app.get("/api/projects", (c) => c.json(store.listProjects()));

  app.post("/api/projects", async (c) => {
    const input = newProjectSchema.parse(await c.req.json());
    const repoPath = await createWorkspace({
      parentDir: input.parent_dir,
      folderName: input.folder_name,
      name: input.name,
      idea: input.idea,
    }).catch((e: Error) => {
      throw new HttpError(400, e.message);
    });
    const project = store.createProject({
      name: input.name,
      description: input.idea,
      repo_path: repoPath,
      provider: input.provider ?? store.getSettings().defaultProvider,
    });
    store.updateSettings({ projectsDir: input.parent_dir });
    return c.json(project, 201);
  });

  // 既存フォルダの点検（取り込みダイアログでの事前表示用）
  app.get("/api/workspace/inspect", async (c) => {
    const info = await inspectWorkspace(c.req.query("path") ?? "");
    const registered = info.gitRoot ? store.findProjectByPath(info.gitRoot) : store.findProjectByPath(info.path);
    return c.json({ ...info, registered_project_id: registered?.id ?? null });
  });

  app.post("/api/projects/import", async (c) => {
    const input = importProjectSchema.parse(await c.req.json());
    const repoPath = await prepareImportedWorkspace(input.path, input.init_git).catch((e: Error) => {
      throw new HttpError(400, e.message);
    });
    const existing = store.findProjectByPath(repoPath);
    if (existing) throw new HttpError(409, `このフォルダは「${existing.name}」として登録済みです`);
    const project = store.createProject({
      name: input.name,
      description: input.description,
      repo_path: repoPath,
      provider: input.provider ?? store.getSettings().defaultProvider,
    });
    return c.json(project, 201);
  });

  app.get("/api/projects/:id", (c) => c.json(requireProject(store, c.req.param("id"))));

  app.patch("/api/projects/:id", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { references, archived, ...patch } = projectPatchSchema.parse(await c.req.json());
    if (patch.write_scopes) {
      // フォルダはリポジトリからの相対パスに揃え、外を指すものは拒否する
      const merged = { ...project.write_scopes };
      for (const [section, folders] of Object.entries(patch.write_scopes) as [keyof typeof merged, string[]][]) {
        try {
          merged[section] = [...new Set(folders.map((f) => normalizeScope(project.repo_path, f)))];
        } catch (e) {
          throw new HttpError(400, (e as Error).message);
        }
      }
      patch.write_scopes = merged;
    }
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
    const abs = path.resolve(raw.replace(/^~(?=$|\/)/, os.homedir()));
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
