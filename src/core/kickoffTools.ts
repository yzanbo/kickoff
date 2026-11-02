import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { isPathInScope } from "./scope.js";
import type { Store } from "./store.js";
import { ARTIFACT_KINDS, PHASES, TASK_STATUSES, type Phase } from "./types.js";

/**
 * エージェントが Kickoff のタスク・成果物を操作するためのツール群（プロバイダー非依存）。
 * Claude は in-process MCP サーバーとして公開する。Codex など他のプロバイダーを追加する際も
 * この定義を再利用する。
 */
export interface KickoffTool {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  readOnly: boolean;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface KickoffToolContext {
  store: Store;
  projectId: number;
  runId: number;
  taskId: number | null;
  phase: Phase;
  /** 書き込みできるフォルダ（指定があれば export_path もこの中に限る） */
  writeScope?: string[];
  /** 成果物の書き出し先（チャットの作業場所。ワークツリーで作業するチャットはそのフォルダ。省略すると本体） */
  workdir?: string;
}

export const KICKOFF_SERVER_NAME = "kickoff";

export function createKickoffTools(ctx: KickoffToolContext): KickoffTool[] {
  const { store, projectId } = ctx;

  // 他プロジェクトのデータに触れないよう、ID 指定の操作は必ずプロジェクトを照合する
  const ownTask = (id: number) => {
    const task = store.getTask(id);
    if (!task || task.project_id !== projectId) throw new Error(`タスク #${id} はこのプロジェクトに存在しません`);
    return task;
  };

  const tools: KickoffTool[] = [
    {
      name: "list_tasks",
      description: "このプロジェクトのタスク一覧を返します。フェーズやステータスで絞り込めます。",
      schema: {
        phase: z.enum(PHASES).optional().describe("絞り込むフェーズ"),
        status: z.enum(TASK_STATUSES).optional().describe("絞り込むステータス"),
      },
      readOnly: true,
      handler: async (args) => {
        const tasks = store.listTasks(projectId, {
          phase: args.phase as Phase | undefined,
          status: args.status as (typeof TASK_STATUSES)[number] | undefined,
        });
        return JSON.stringify(
          tasks.map((t) => ({ id: t.id, phase: t.phase, status: t.status, priority: t.priority, title: t.title })),
          null,
          2,
        );
      },
    },
    {
      name: "get_task",
      description: "タスクの詳細（説明・受け入れ基準・完了サマリー）を返します。",
      schema: { task_id: z.number().int().describe("タスク ID") },
      readOnly: true,
      handler: async (args) => JSON.stringify(ownTask(args.task_id as number), null, 2),
    },
    {
      name: "create_task",
      description:
        "タスクを起票します。1 タスクは 1 回のエージェント実行で完了できる粒度にし、受け入れ基準を具体的に書いてください。",
      schema: {
        phase: z.enum(PHASES).describe("タスクのフェーズ"),
        title: z.string().min(1).max(200).describe("簡潔なタイトル"),
        description: z.string().describe("やること・背景・関連ファイル"),
        acceptance_criteria: z.string().optional().describe("完了の判定基準（箇条書き推奨）"),
        priority: z.number().int().min(1).max(3).optional().describe("1: 高 / 2: 中 / 3: 低（既定 2）"),
      },
      readOnly: false,
      handler: async (args) => {
        const task = store.createTask({
          project_id: projectId,
          phase: args.phase as Phase,
          title: args.title as string,
          description: args.description as string,
          acceptance_criteria: (args.acceptance_criteria as string | undefined) ?? "",
          priority: (args.priority as number | undefined) ?? 2,
          created_by: "agent",
        });
        return `タスク #${task.id} を起票しました（${task.phase} / ${task.title}）`;
      },
    },
    {
      name: "update_task",
      description: "タスクのステータスや完了サマリーを更新します。作業の完了・中断時に必ず呼んでください。",
      schema: {
        task_id: z.number().int().describe("タスク ID"),
        status: z.enum(TASK_STATUSES).optional().describe("新しいステータス"),
        summary: z.string().optional().describe("実施内容・確認結果・残課題の要約"),
      },
      readOnly: false,
      handler: async (args) => {
        const task = ownTask(args.task_id as number);
        const updated = store.updateTask(task.id, {
          status: args.status as (typeof TASK_STATUSES)[number] | undefined,
          summary: args.summary as string | undefined,
        });
        return `タスク #${updated.id} を更新しました（status: ${updated.status}）`;
      },
    },
    {
      name: "list_artifacts",
      description: "保存済みの成果物（要件定義書・テストレポートなど）の一覧を返します。",
      schema: { kind: z.enum(ARTIFACT_KINDS).optional().describe("絞り込む種類") },
      readOnly: true,
      handler: async (args) => {
        const items = store.listArtifacts(projectId, { kind: args.kind as (typeof ARTIFACT_KINDS)[number] | undefined });
        return JSON.stringify(
          items.map((a) => ({ id: a.id, kind: a.kind, title: a.title, file_path: a.file_path, created_at: a.created_at })),
          null,
          2,
        );
      },
    },
    {
      name: "get_artifact",
      description: "成果物の本文を返します。",
      schema: { artifact_id: z.number().int().describe("成果物 ID") },
      readOnly: true,
      handler: async (args) => {
        const a = store.getArtifact(args.artifact_id as number);
        if (!a || a.project_id !== projectId) throw new Error(`成果物 #${args.artifact_id} はこのプロジェクトに存在しません`);
        return `# ${a.title}\n\n${a.content}`;
      },
    },
    {
      name: "save_artifact",
      description:
        "成果物を Kickoff に保存します。export_path を指定すると、リポジトリ内のそのパスにも Markdown として書き出します。",
      schema: {
        kind: z.enum(ARTIFACT_KINDS).describe("成果物の種類"),
        title: z.string().min(1).describe("タイトル"),
        content: z.string().min(1).describe("本文（Markdown）"),
        export_path: z.string().optional().describe("リポジトリ内の書き出し先（相対パス。例: docs/requirements.md）"),
      },
      readOnly: false,
      handler: async (args) => {
        const project = store.getProject(projectId)!;
        // 書き出しはチャットの作業場所へ（ワークツリーのチャットが本体に書いて、本体に変更が出ないように）
        const dir = ctx.workdir ?? project.repo_path;
        let filePath = "";
        if (args.export_path) {
          const exportPath = args.export_path as string;
          if (ctx.writeScope && !isPathInScope(dir, ctx.writeScope, exportPath)) {
            throw new Error(
              ctx.writeScope.length
                ? `export_path は ${ctx.writeScope.map((s) => `${s}/`).join("、")} の中にしてください`
                : "このセクションでは export_path を指定できません",
            );
          }
          filePath = await exportToRepo(dir, exportPath, args.content as string);
        }
        const artifact = store.createArtifact({
          project_id: projectId,
          phase: ctx.phase,
          kind: args.kind as (typeof ARTIFACT_KINDS)[number],
          title: args.title as string,
          content: args.content as string,
          file_path: filePath,
          run_id: ctx.runId,
          task_id: ctx.taskId,
        });
        return `成果物 #${artifact.id} を保存しました${filePath ? `（${filePath} にも書き出し）` : ""}`;
      },
    },
  ];
  return tools;
}

/** リポジトリ外への書き込みを防ぎつつファイルを書き出す */
export async function exportToRepo(repoPath: string, relPath: string, content: string): Promise<string> {
  if (path.isAbsolute(relPath)) throw new Error("export_path はリポジトリからの相対パスで指定してください");
  const root = path.resolve(repoPath);
  const target = path.resolve(root, relPath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("export_path がリポジトリの外を指しています");
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content.endsWith("\n") ? content : content + "\n", "utf8");
  return path.relative(root, target);
}
