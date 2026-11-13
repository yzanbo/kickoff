import path from "node:path";
import type { Hono } from "hono";
import { z } from "zod";
import type { BranchSuggestBody, BranchSuggestions, GitWorktree, WorktreeEnvSetupBody, WorktreeEnvSetupResult, WorktreeRemovalInfo } from "@shared/types";
import { addWorktree, findWorktree, gitRefs, isGitWorkTree, listWorktrees, removeWorktree, worktreePathFor, worktreeRemovalInfo } from "../../git/index.js";
import { branchSuggestPrompt, parseBranchSuggestions } from "../../git/branchSuggest.js";
import { envSetupPrompt, envSetupTitle } from "../../worktreeEnv/setupPrompt.js";
import type { ServerDeps } from "../server.js";
import { realPathOrSelf } from "../../system/paths.js";
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
export function worktreeRoutes(app: Hono, { store, runner, providers, prWatch, worktreeEnvs, databases }: ServerDeps) {
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
   * そのワークツリーを作業場所にしているチャットの持ち主（プロジェクトと、そのプロジェクトから見た作業場所）。
   * 同じリポジトリの中の別のフォルダを本体にしているプロジェクトも、同じワークツリーの中で作業していることがある（ブランチが同じなら使い回す）ので、
   * リポジトリの一番上（本体の root）の下にあるプロジェクトをすべて見る
   */
  const usersOf = (worktree: GitWorktree, list: GitWorktree[]) => {
    const top = list.find((w) => w.main)?.root;
    if (!top) return [];
    // 登録したパスがシンボリックリンクを含むこともある（/var → /private/var）ので、実体で比べる
    return store.projects
      .list()
      .map((p) => ({ id: p.id, real: realPathOrSelf(p.repo_path) }))
      .filter((p) => p.real === top || p.real.startsWith(`${top}/`))
      .map((p) => ({ projectId: p.id, path: path.join(worktree.root, path.relative(top, p.real)) }));
  };

  /** 作業中のチャットがあるうちは消さない（作業中のフォルダが消えてしまう） */
  const assertIdle = (users: { projectId: number; path: string }[]) => {
    if (users.some((u) => store.chats.inWorktree(u.projectId, u.path).some((r) => runner.isBusy(r.id)))) {
      throw new Conflict("このワークツリーで作業中のチャットがあります。終わってから消してください");
    }
  };
  const clearChats = (users: { projectId: number; path: string }[]) => {
    for (const u of users) store.chats.clearWorktree(u.projectId, u.path);
  };

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
   * 消えたら、そこで作業していたチャット（同じリポジトリのほかのプロジェクトのものも）の続きを本体で進める（ブランチを消すところで失敗しても、ワークツリーが消えていればチャットは本体に戻す）。
   * 残ったワークツリーの一覧を返す
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
    const list = await listWorktrees(project.repo_path);
    const target = list.find((w) => w.path === folder);
    const users = target ? usersOf(target, list) : [{ projectId: project.id, path: folder }];
    assertIdle(users);
    try {
      const worktrees = await removeWorktree(project.repo_path, folder, { force, deleteBranch: delete_branch });
      clearChats(users);
      // 消えたら、コンテナとデータ（選ばれたとき。組の名前で消すのでフォルダがなくてよい）を片付け、帯を空ける。消せなかった組は記録に残す
      const failed = await worktreeEnvs.release(folder, { downVolumes: down_volumes });
      if (failed.length) console.warn("[worktree-env] コンテナとデータを消せませんでした", failed);
      // このワークツリーの DB から作った接続（選ばれたら消す。残すなら結び付きだけ外す）
      if (drop_db_connections) for (const conn of store.dbConnections.ofWorktree(folder)) databases.removeConnection(conn.id);
      else store.dbConnections.clearWorktree(folder);
      // そのワークツリーの PR の知らせ・印を消す（GitHub には聞き直さない）
      await prWatch.recomputeAll();
      return c.json(worktreeEnvs.attach(project.id, worktrees));
    } catch (e) {
      // 一覧も取れなければ、消えたか分からないので戻さない
      const gone = await findWorktree(project.repo_path, folder).then((w) => !w, () => false);
      if (gone) clearChats(users);
      throw e;
    }
  });
}
