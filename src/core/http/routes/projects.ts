import fs from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import { z } from "zod";
import { expandHome } from "../../system/paths.js";
import type { ServerDeps } from "../server.js";
import { PROVIDER_IDS, type ImportProjectBody, type NewProjectBody, type Project, type ProjectPatch, type ProjectRepoPathBody, type ProviderId } from "@shared/types";
import { createWorkspace, initGitRepo, inspectWorkspace, prepareImportedWorkspace } from "../../git/workspace.js";
import { Conflict, Invalid } from "../errors.js";
import { jsonBody } from "../input.js";
import { lookups } from "../lookups.js";
import { ABSOLUTE_FOLDER, chatDefaultsSchema, isAbsoluteFolder, compactPrompt, projectDescription, projectName } from "./schemas.js";
import { PROJECT_HUES } from "@shared/project/colors";
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTags } from "@shared/project/tags";

// 新しいプロジェクト（description は README の「アイデア」にも書く）
const newProjectSchema = z.object({
  name: projectName,
  description: projectDescription.default(""),
  parent_dir: z.string().trim().min(1),
  folder_name: z.string().trim().min(1).max(100),
  provider: z.enum(PROVIDER_IDS).optional(),
  init_git: z.boolean().default(true),
}) satisfies z.ZodType<NewProjectBody>;

const importProjectSchema = z.object({
  path: z.string().trim().min(1),
  name: projectName,
  description: projectDescription.default(""),
  init_git: z.boolean().default(false),
  provider: z.enum(PROVIDER_IDS).optional(),
}) satisfies z.ZodType<ImportProjectBody>;

const repoPathSchema = z.object({
  path: z.string().trim().min(1).max(1000),
  init_git: z.boolean().default(false),
}) satisfies z.ZodType<ProjectRepoPathBody>;

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
    // 送った内容で置き換える（書いていない項目はアプリ全体の設定に従う）
    chat_defaults: chatDefaultsSchema.partial().strict(),
    // メモのフォルダを、このプロジェクトだけ別の場所にする（null なら親フォルダの下）
    memo_path: z.string().trim().min(1).max(1000).refine(isAbsoluteFolder, ABSOLUTE_FOLDER).nullable(),
    // このプロジェクトの圧縮前指示（null ならなし）
    pre_compact_prompt: compactPrompt,
    post_compact_prompt: compactPrompt,
    // このプロジェクトの圧縮前指示・圧縮後指示を送るか（オフでも文は残す）
    pre_compact_enabled: z.boolean(),
    post_compact_enabled: z.boolean(),
  })
  .partial() satisfies z.ZodType<ProjectPatch>;

/** プロジェクト（作成・取り込み・設定の変更・フォルダの変更・git の管理を始める・並び順・管理から外す）。変えたら、変えたあとのプロジェクト（並べ替えは一覧。管理から外すのは 204） */
export function projectRoutes(app: Hono, { store, runner }: ServerDeps) {
  const { withProject } = lookups(store);
  // 指定がなければ、設定の既定のプロバイダー
  const providerOf = (provider?: ProviderId) => provider ?? store.settings.get().default_provider;
  /**
   * そのフォルダ（実体のパス。inspectWorkspace の path・git_root）を本体にしているプロジェクト（except は除く）。
   * 登録したパスがシンボリックリンクを含む（/tmp → /private/tmp など）こともあるので、登録したパスの実体とも比べる
   */
  /** プロジェクトに作業中のチャットがあれば 409（フォルダを変える・git の管理を始めるなど、フォルダごと変わる操作の前に） */
  const requireNoBusyChat = (projectId: number, refusal: string) => {
    if (store.chats.list({ projectId, includeArchived: true }).some((chat) => runner.isBusy(chat.id))) {
      throw new Conflict(`作業中のチャットがあるので、${refusal}。終わってから（または中断してから）行ってください`);
    }
  };
  const projectAt = (realPath: string, except?: number) =>
    store.projects.list().find((p) => p.id !== except && (p.repo_path === realPath || realPathOrSelf(p.repo_path) === realPath));

  app.get("/api/projects", (c) => c.json(store.projects.list()));

  app.post("/api/projects", async (c) => {
    const input = newProjectSchema.parse(await jsonBody(c));
    const repoPath = await createWorkspace({ parentDir: input.parent_dir, folderName: input.folder_name, name: input.name, description: input.description, initGit: input.init_git });
    const project = store.projects.create({ name: input.name, description: input.description, repo_path: repoPath, provider: providerOf(input.provider) });
    store.settings.update({ projects_dir: input.parent_dir });
    return c.json(project, 201);
  });

  // 既存フォルダの点検（取り込みダイアログでの事前表示用）
  app.get("/api/workspace/inspect", async (c) => {
    const { path } = z.object({ path: z.string().trim().min(1).max(1000) }).parse({ path: c.req.query("path") });
    const info = await inspectWorkspace(path);
    const registered = projectAt(info.git_root ?? info.path);
    return c.json({ ...info, registered_project_id: registered?.id ?? null });
  });

  app.post("/api/projects/import", async (c) => {
    const input = importProjectSchema.parse(await jsonBody(c));
    const repoPath = await prepareImportedWorkspace(input.path, input.init_git);
    const existing = projectAt(repoPath);
    if (existing) throw new Conflict(`このフォルダは「${existing.name}」として登録済みです`);
    const project = store.projects.create({ name: input.name, description: input.description, repo_path: repoPath, provider: providerOf(input.provider) });
    return c.json(project, 201);
  });

  app.get("/api/projects/:id", withProject, (c) => c.json(c.var.project));

  app.patch("/api/projects/:id", withProject, async (c) => {
    const { project } = c.var;
    const { reference_paths, archived, ...patch } = projectPatchSchema.parse(await jsonBody(c));
    return c.json(
      store.projects.update(project.id, {
        ...patch,
        ...(reference_paths ? { reference_paths: resolveReferences(reference_paths) } : {}),
        ...(archived === undefined ? {} : { archived_at: archived ? (project.archived_at ?? new Date().toISOString()) : null }),
      }),
    );
  });

  /**
   * プロジェクトのフォルダ（本体）を変える（フォルダを移した・別の場所に置き直したとき）。取り込みと同じ決まりで確かめ、
   * ほかのプロジェクトのフォルダなら 409、作業中のチャットがあれば 409。チャット・設定はそのまま引き継ぎ、本体で作業するチャットは次から新しいフォルダで動く
   * （Claude Code の会話は作業フォルダが変わっても続く）。ワークツリーのチャットの作業場所は変えない
   */
  app.put("/api/projects/:id/repo-path", withProject, async (c) => {
    const { project } = c.var;
    const input = repoPathSchema.parse(await jsonBody(c));
    // git の初期化（フォルダを書き換える）より前に、重なり・作業中を確かめる
    const info = await inspectWorkspace(input.path);
    const target = info.git_root ?? info.path;
    if (target === realPathOrSelf(project.repo_path)) return c.json(project);
    const existing = projectAt(target, project.id);
    if (existing) throw new Conflict(`このフォルダは「${existing.name}」として登録済みです`);
    requireNoBusyChat(project.id, "フォルダを変えられません");
    const repoPath = await prepareImportedWorkspace(input.path, input.init_git);
    return c.json(store.projects.update(project.id, { repo_path: repoPath }));
  });

  /**
   * git で管理していないプロジェクトで、git の管理を始める（main で初期化し、いまあるファイルで最初のコミットを作る。コミットがなければコミットだけ）。
   * もう管理している・ほかのリポジトリの中なら 409、作業中のチャットがあれば 409（書きかけのファイルをコミットしないため）。返すものはない（204。画面は Git の状態を取り直す）
   */
  app.post("/api/projects/:id/git/init", withProject, async (c) => {
    const { project } = c.var;
    requireNoBusyChat(project.id, "git の管理を始められません");
    await initGitRepo(project.repo_path);
    return c.body(null, 204);
  });

  // サイドバーでのプロジェクトの並び順（並べたあとの一覧を返す。グループの並べ替えと同じ）
  app.put("/api/projects/order", async (c) => {
    const { ids } = z.object({ ids: z.array(z.number().int()).max(500) }).parse(await jsonBody(c));
    return c.json(store.projects.reorder(ids));
  });

  // Kickoff の管理から外すだけで、フォルダやリポジトリは削除しない
  app.delete("/api/projects/:id", withProject, (c) => {
    store.projects.delete(c.var.project.id);
    return c.body(null, 204);
  });
}

/** パスの実体（シンボリックリンクを解いたもの）。見つからなければそのまま */
function realPathOrSelf(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

/** 参照資料のパスを絶対パスにそろえ（~ はホームフォルダ）、フォルダかファイルかを調べる。見つからなければ 400 */
function resolveReferences(input: { path: string }[]): Project["reference_paths"] {
  const seen = new Set<string>();
  const out: Project["reference_paths"] = [];
  for (const { path: raw } of input) {
    const abs = path.resolve(expandHome(raw));
    if (seen.has(abs)) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      throw new Invalid(`見つかりません: ${raw}`);
    }
    seen.add(abs);
    out.push({ path: abs, kind: stat.isDirectory() ? "folder" : "file" });
  }
  return out;
}
