import type { Hono } from "hono";
import { z } from "zod";
import type { BranchSuggestBody, BranchSuggestions, WorktreeEnvSetupBody, WorktreeEnvSetupResult, WorktreeRemovalInfo } from "@shared/types";
import { addWorktree, gitRefs, isGitWorkTree, listWorktrees, worktreePathFor, worktreeRemovalInfo } from "../../git/index.js";
import { branchSuggestPrompt, parseBranchSuggestions } from "../../git/branchSuggest.js";
import { envSetupPrompt, envSetupTitle } from "../../worktreeEnv/setupPrompt.js";
import type { ServerDeps } from "../server.js";
import { asInvalid, Conflict, Invalid } from "../errors.js";
import { jsonBody } from "../input.js";
import { lookups } from "../lookups.js";
import { branchName, folderPath } from "./schemas.js";

/** ブランチ名の案を頼む本文（やりたいことの概要） */
const branchSuggestSchema = z.object({ summary: z.string().trim().min(1).max(4000) }) satisfies z.ZodType<BranchSuggestBody>;

/**
 * ワークツリー（一覧・作る・消す。置き場所の案は path?branch= で）。PR がマージされたあとの片付けは、ブランチも消す（delete_branch）「消す」。
 * 新しいワークツリーのブランチ名の案は branch-suggestions（やりたいことの概要から、プロジェクトの AI に 1 回だけ聞く）
 */
export function worktreeRoutes(app: Hono, { store, runner, providers, worktreeEnvs, worktreeFinisher }: ServerDeps) {
  const { withProject } = lookups(store);

  // Git で管理していないフォルダは、ワークツリーのないもの（空）として返す（Git の状態の repo: false と同じ扱い。失敗にすると、画面が取り直し続ける）
  app.get("/api/projects/:id/git/worktrees", withProject, async (c) => {
    const { project } = c.var;
    // ワークツリーの実行環境（ポートの帯・組の名前）も付ける
    return c.json((await isGitWorkTree(project.repo_path)) ? worktreeEnvs.attach(project.id, await listWorktrees(project.repo_path)) : []);
  });

  app.get("/api/projects/:id/git/worktrees/path", withProject, async (c) => {
    const { branch } = z.object({ branch: branchName }).parse({ branch: c.req.query("branch") });
    return c.json({ path: await worktreePathFor(c.var.project.repo_path, branch) });
  });

  // やりたいことの概要から、ブランチ名の案を AI に出してもらう（軽いモデルで 1 回だけ。いまあるブランチと同じ名前は除く。案が作れなければ 400）
  app.post("/api/projects/:id/git/branch-suggestions", withProject, async (c) => {
    const { summary } = branchSuggestSchema.parse(await jsonBody(c));
    const project = c.var.project;
    const provider = providers[project.provider];
    if (!provider?.ask) throw new Invalid("このプロジェクトの AI は、ブランチ名の提案に対応していません");
    const taken = (await isGitWorkTree(project.repo_path)) ? (await gitRefs(project.repo_path)).branches.map((b) => b.name) : [];
    const answer = await provider.ask(branchSuggestPrompt(summary, taken), { model: "haiku" }).catch(asInvalid);
    const branches = parseBranchSuggestions(answer, taken);
    if (branches.length === 0) throw new Invalid("ブランチ名の案を作れませんでした。やりたいことを少し詳しく書いて、もう一度試してください");
    return c.json({ branches } satisfies BranchSuggestions);
  });

  app.post("/api/projects/:id/git/worktrees", withProject, async (c) => {
    const { branch } = z.object({ branch: branchName }).parse(await jsonBody(c));
    const { project } = c.var;
    // 作ったら、ポートの帯と組の名前を割り当てる（ワークツリーの実行環境）
    const list = await addWorktree(project.repo_path, branch, (made) => worktreeEnvs.prepare(project, made));
    return c.json(worktreeEnvs.attach(project.id, list), 201);
  });

  /**
   * ［AI で整える］（ワークツリーの実行環境の段階 2。利用者が押したときだけ）: この機能より前に作ったワークツリーなら先に手順を流し、
   * そのワークツリーで新しいチャット「実行環境を整える（ブランチ）」を始める（Git で管理していないファイルだけを書ける。選択はプロジェクトの既定）。
   * 同じワークツリーの［AI で整える］のチャットが作業中なら 409
   */
  app.post("/api/projects/:id/git/worktrees/env-setup", withProject, async (c) => {
    const { project } = c.var;
    const { path: folder } = z.object({ path: folderPath }).parse(await jsonBody(c)) satisfies WorktreeEnvSetupBody;
    const list = await listWorktrees(project.repo_path);
    const worktree = list.find((w) => w.path === folder && !w.main);
    if (!worktree) throw new Invalid("このプロジェクトのワークツリーではありません");
    if (store.chats.inWorktree(project.id, folder).some((r) => r.untracked_only && runner.isBusy(r.id))) {
      throw new Conflict("このワークツリーの実行環境を整えるチャットが作業中です。終わってから押してください");
    }
    const input = await worktreeEnvs.setupInput(project, worktree);
    const chat = await runner.start({ projectId: project.id, prompt: envSetupPrompt(input), title: envSetupTitle(input.label), worktreePath: folder, untrackedOnly: true });
    return c.json({ chat, worktrees: worktreeEnvs.attach(project.id, list) } satisfies WorktreeEnvSetupResult, 201);
  });

  // 消す前の確かめ（コミットしていない変更・プッシュしていないコミット）
  app.get("/api/projects/:id/git/worktrees/info", withProject, async (c) => {
    const { path: folder } = z.object({ path: folderPath }).parse({ path: c.req.query("path") });
    const info = await worktreeRemovalInfo(c.var.project.repo_path, folder);
    // このワークツリーの DB から作った接続（消す確認の「この接続も消す」。名前だけ）
    const connections = store.dbConnections.ofWorktree(folder).map((conn) => ({ id: conn.id, name: conn.name }));
    return c.json({ ...info, db_connections: connections } satisfies WorktreeRemovalInfo);
  });

  /**
   * ワークツリーを消す（force: コミットしていない変更があっても消す。delete_branch: 取り出していたブランチも消す = PR がマージされたあとの片付け。
   * down_volumes: Kickoff が組の名前を割り当てたワークツリーなら、その組のコンテナとデータも docker compose down -v で消す。
   * drop_db_connections: Docker タブの「DB で開く」でこのワークツリーの DB から作った接続も消す。消さなければ、どのワークツリーのものかだけ外す）。ポートの帯は空ける。
   * 中身は AI の finish_worktree と同じ worktrees/finish.ts（失うもの = force で消すコミットしていない変更・delete_branch で消す取り込んでいないコミットは、
   * Kickoff のゴミ箱に 3 日残る控えに入れてから消す。そこで作業していたチャットは本体に戻してお知らせを残す）。残ったワークツリーの一覧を返す
   */
  app.post("/api/projects/:id/git/worktrees/remove", withProject, async (c) => {
    const { project } = c.var;
    const { path: folder, force, delete_branch, down_volumes, drop_db_connections } = z
      .object({
        path: folderPath,
        force: z.boolean().default(false),
        delete_branch: z.boolean().default(false),
        down_volumes: z.boolean().default(false),
        drop_db_connections: z.boolean().default(false),
      })
      .parse(await jsonBody(c));
    const { worktrees } = await worktreeFinisher.remove(project, folder, {
      force,
      deleteBranch: delete_branch,
      downVolumes: down_volumes,
      dropDbConnections: drop_db_connections,
      deleteMergedRemote: false,
      byChatId: null,
    });
    return c.json(worktreeEnvs.attach(project.id, worktrees));
  });
}
