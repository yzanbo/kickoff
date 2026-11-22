// プロジェクトの手順（作成・取り込み・点検・設定の変更・フォルダの変更・git の管理を始める・並び順・ゴミ箱へ入れる）。HTTP を知らない（受け口は routes.ts）
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { ImportProjectBody, NewProjectBody, ProjectPatch, ProjectRepoPathBody } from "@shared/foundation/apiTypes";
import type { FolderInspection, Project } from "@shared/projects/types";
import type { ProviderId } from "@shared/settings/types";
import { Conflict, Invalid } from "@/foundation/core/errors";
import type { Kernel } from "@/foundation/core/kernel";
import { expandHome, realPathLoose, realPathOrSelf } from "@/foundation/core/system/paths";
import { worktreeMoves } from "@/foundation/core/workplace/worktrees";
import type { TrashApi } from "@/features/trash/core/index";
import type { ProjectStore } from "./db/projects";
import { trashedProjectAt, trashProject } from "./trash";
import { createWorkspace, initGitRepo, inspectWorkspace, prepareImportedWorkspace, toFolderName } from "./workspace";

/** 上の機能が登録した口（core/index.ts の ProjectsApi の登録を束ねたもの） */
export interface ProjectHooks {
  /** 作業中のチャットがあるか（chat が登録） */
  isBusy(projectId: number): boolean;
  /** 設定を変えたあと（変えた項目の名前。github が登録: PR の見張りを聞き直す） */
  afterUpdate(project: Project, changed: readonly string[]): void;
  /** 本体のフォルダを変えたあと（変える前のプロジェクトと、ワークツリーの作業場所の付け替え先。workplaceMove が登録: 作業場所を移す） */
  afterRepoMove(before: Project, moves: ReadonlyMap<string, string | null>): Promise<void>;
  /** プロジェクトをゴミ箱に入れたとき（chat が登録: 中のチャットを同じ行 trashId で入れ、作業中の状態を捨てる） */
  trashed(project: Project, trashId: string, at: string): void;
}

/** ノートのフォルダ名を決める（notes の決まり。ほかのプロジェクトと重なれば「名前-2」。組み立てが渡す） */
export type NoteFolderName = (base: string, projects: readonly Project[], except: number) => string;

/** 手順が使うもの */
export interface ProjectsCtx {
  db: DatabaseSync;
  settings: Kernel["settings"];
  projects: ProjectStore;
  trashBin: TrashApi;
  hooks: ProjectHooks;
  noteFolderName: NoteFolderName;
}

/** 新しいプロジェクト・取り込みの入力（省いた項目は既定を入れたあと） */
type Defaulted<T> = Omit<T, "description" | "init_git"> & { description: string | null; init_git: boolean };

/** プロジェクトに作業中のチャットがあれば 409（フォルダを変える・git の管理を始めるなど、フォルダごと変わる操作の前に） */
function requireNoBusyChat(ctx: ProjectsCtx, projectId: number, refusal: string) {
  if (ctx.hooks.isBusy(projectId)) throw new Conflict(`作業中のチャットがあるので、${refusal}。終わってから（または中断してから）行ってください`);
}

/**
 * そのフォルダ（実体のパス。inspectWorkspace の path・git_root）を本体にしているプロジェクト（except は除く）。
 * 登録したパスがシンボリックリンクを含む（/tmp → /private/tmp など）こともあるので、登録したパスの実体とも比べる
 */
function projectAt(ctx: ProjectsCtx, realPath: string, except?: number) {
  const same = (p: Project) => p.id !== except && (p.repo_path === realPath || realPathOrSelf(p.repo_path) === realPath);
  // 同じフォルダのプロジェクトがゴミ箱にあれば、新しく登録せず戻してもらう（フォルダは 1 つのプロジェクトにだけ登録できる）
  const trashed = trashedProjectAt(ctx.projects, same);
  if (trashed) throw new Conflict(`このフォルダのプロジェクト「${trashed.name}」は Kickoff のゴミ箱にあります（3 日で消えます）。設定の「ゴミ箱と整理」から戻してください`);
  return ctx.projects.list().find(same);
}

/**
 * 作ったプロジェクトにノートのフォルダを決める（画面の新しいプロジェクトのダイアログの「ノートの保存先」）。note_dir（別の場所）が先、
 * なければ note_folder（設定の親フォルダの下の名前。使える名前にし、ほかのプロジェクトのフォルダ名と重なれば「名前-2」）。どちらもなければ、初めてノートを使ったときに決める
 */
function withNoteDir(ctx: ProjectsCtx, project: Project, input: { note_folder?: string; note_dir?: string }): Project {
  if (input.note_dir) return ctx.projects.update(project.id, { note_dir: input.note_dir });
  if (!input.note_folder) return project;
  // ゴミ箱のプロジェクトのフォルダ名とも重ねない（戻したときに同じノートのフォルダを指さないように）
  return ctx.projects.update(project.id, { note_folder: ctx.noteFolderName(input.note_folder, [...ctx.projects.list(), ...ctx.projects.trashed()], project.id) });
}

/** 指定がなければ、設定の既定のプロバイダー */
const providerOf = (ctx: ProjectsCtx, provider?: ProviderId) => provider ?? ctx.settings.get().default_provider;

/** 新しいプロジェクト（フォルダを作り、作った親フォルダを次の既定にする） */
export async function createProject(ctx: ProjectsCtx, input: Defaulted<NewProjectBody>): Promise<Project> {
  // 作る場所がほかのプロジェクトのフォルダなら断る（空のフォルダだと createWorkspace は通り、同じフォルダに 2 つ目のプロジェクトができていた）
  const folder = toFolderName(input.folder_name);
  const registered = folder ? projectAt(ctx, realPathLoose(path.join(path.resolve(expandHome(input.parent_dir)), folder))) : undefined;
  if (registered) throw new Conflict(`このフォルダは「${registered.name}」として登録済みです`);
  const repoPath = await createWorkspace({ parentDir: input.parent_dir, folderName: input.folder_name, name: input.name, description: input.description, initGit: input.init_git });
  const project = withNoteDir(ctx, ctx.projects.create({ name: input.name, description: input.description, repo_path: repoPath, provider: providerOf(ctx, input.provider) }), input);
  ctx.settings.update({ projects_dir: input.parent_dir });
  return project;
}

/** 既存のフォルダの点検（取り込みのダイアログでの事前表示） */
export async function inspectFolder(ctx: ProjectsCtx, folder: string): Promise<FolderInspection> {
  const info = await inspectWorkspace(folder);
  return { ...info, registered_project_id: projectAt(ctx, info.path)?.id ?? null };
}

/** 既存のフォルダを取り込む */
export async function importProject(ctx: ProjectsCtx, input: Defaulted<ImportProjectBody>): Promise<Project> {
  const repoPath = await prepareImportedWorkspace(input.path, input.init_git);
  const existing = projectAt(ctx, repoPath);
  if (existing) throw new Conflict(`このフォルダは「${existing.name}」として登録済みです`);
  return withNoteDir(ctx, ctx.projects.create({ name: input.name, description: input.description, repo_path: repoPath, provider: providerOf(ctx, input.provider) }), input);
}

/** 書いた項目だけ変える（参照資料はパスを調べ、アーカイブは時刻にする）。変えた項目は上の機能に知らせる */
export function updateProject(ctx: ProjectsCtx, project: Project, input: ProjectPatch): Project {
  const { reference_paths, archived, ...patch } = input;
  const updated = ctx.projects.update(project.id, {
    ...patch,
    ...(reference_paths ? { reference_paths: resolveReferences(reference_paths) } : {}),
    ...(archived === undefined ? {} : { archived_at: archived ? (project.archived_at ?? new Date().toISOString()) : null }),
  });
  ctx.hooks.afterUpdate(project, Object.keys(input).filter((key) => input[key as keyof typeof input] !== undefined));
  return updated;
}

/**
 * プロジェクトのフォルダ（本体）を変える（フォルダを移した・別の場所に置き直したとき）。取り込みと同じ決まりで確かめ、
 * ほかのプロジェクトのフォルダなら 409、作業中のチャットがあれば 409。チャット・設定はそのまま引き継ぎ、本体で作業するチャットは次から新しいフォルダで動く
 * （Claude Code の会話は作業フォルダが変わっても続く）。選んだフォルダをそのまま本体にする（git のリポジトリの中のフォルダでもよい）。
 * ワークツリーで作業していたチャットは、同じリポジトリの中で変えたなら同じワークツリーの中の新しいフォルダへ、そうでなければ本体へ付け替える（worktreeMoves）。
 * どのチャットも作業フォルダが変わるので、区切り（作業場所を移した区切り）を置いて会話を新しいセッションに写す
 */
export async function changeProjectFolder(ctx: ProjectsCtx, project: Project, input: Required<ProjectRepoPathBody>): Promise<Project> {
  // git の初期化（フォルダを書き換える）より前に、重なり・作業中を確かめる
  const info = await inspectWorkspace(input.path);
  if (info.path === realPathOrSelf(project.repo_path)) return project;
  const existing = projectAt(ctx, info.path, project.id);
  if (existing) throw new Conflict(`このフォルダは「${existing.name}」として登録済みです`);
  requireNoBusyChat(ctx, project.id, "フォルダを変えられません");
  const repoPath = await prepareImportedWorkspace(input.path, input.init_git);
  // ワークツリーで作業していたチャットの付け替え（同じリポジトリなら同じワークツリーの中の新しいフォルダ、そうでなければ本体）
  const moves = await worktreeMoves(project.repo_path, repoPath);
  const updated = ctx.projects.update(project.id, { repo_path: repoPath });
  // チャットの作業場所を移す（作業フォルダが変わるので、会話を新しいセッションに写して区切りを置く）
  await ctx.hooks.afterRepoMove(project, moves);
  return updated;
}

/**
 * git で管理していないプロジェクトで、git の管理を始める（main で初期化し、いまあるファイルで最初のコミットを作る。コミットがなければコミットだけ）。
 * もう管理している・ほかのリポジトリの中なら 409、作業中のチャットがあれば 409（書きかけのファイルをコミットしないため）
 */
export async function startProjectGit(ctx: ProjectsCtx, project: Project): Promise<void> {
  requireNoBusyChat(ctx, project.id, "git の管理を始められません");
  await initGitRepo(project.repo_path);
}

/**
 * Kickoff の管理から外す（フォルダやリポジトリは削除しない）= Kickoff のゴミ箱へ入れる（チャット・DB の接続・定型文・設定などを丸ごと 3 日残し、
 * 戻せる。3 日たったら会話記録のファイル・添付ごと本当に消す）。作業中のチャットがあれば消せない。入れたゴミ箱の ID を返す
 */
export function trashProjectById(ctx: ProjectsCtx, project: Project): { trash_id: string } {
  requireNoBusyChat(ctx, project.id, "プロジェクトを削除できません");
  const item = trashProject({ db: ctx.db, projects: ctx.projects, trashBin: ctx.trashBin, trashed: ctx.hooks.trashed }, project);
  return { trash_id: item.id };
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
