// ワークツリーを消す手順（画面の「消す」と AI の後始末が通る）: 作業中か → 確かめ → 控え → 追いかけ先・実行環境の覚えを先に読む → 消す（失敗時の戻し）
// → チャットを本体へ → 実行環境を空ける（Docker の組の片付けの結果を文に使うので待つ）→ リモート → 消した知らせ
import path from "node:path";
import type { GitWorktree } from "@shared/git/types";
import type { Project } from "@shared/projects/types";
import { errorMessage } from "@shared/foundation/errors";
import type { WorktreeTrashDetails } from "@shared/trash/types";
import type { ChatRunPort, ChatStoreDeps } from "@/features/chat/core/index";
import type { ComposeReader } from "@/features/docker/core/index";
import type { TrashApi } from "@/features/trash/core/index";
import type { WorkplaceMoveApi } from "@/features/workplaceMove/core/index";
import { Conflict, Invalid, NotFound } from "@/foundation/core/errors";
import { realPathOrSelf } from "@/foundation/core/system/paths";
import type { WorkplaceKit } from "@/foundation/core/workplace/kit";
import { listRemotes, upstreamOf } from "@/foundation/core/workplace/reads";
import { findWorktree, listWorktrees, removeWorktree } from "@/foundation/core/workplace/worktrees";
import { dropTrashRefs, saveTrashRefs, snapshotWorkingTree } from "./backup";
import type { WorktreeStores } from "./db/stores";
import type { WorktreeEnvService } from "./env/service";
import type { WorktreeEvents } from "./events";
import { inspectWorktree, type MergeCheck } from "./inspect";
import { finishedText, lossText, type FinishOutcome } from "./report";

/** 消し方（画面の「消す」の選択と、AI の後始末の決まった選び方） */
export interface FinishOptions {
  /** コミットしていない変更があっても消す（あれば控えに入れる） */
  force: boolean;
  /** 取り出していたブランチも消す（取り込んでいないコミットがあれば控えに入れる） */
  deleteBranch: boolean;
  /** Kickoff が組の名前を割り当てたワークツリーなら、その組のコンテナとデータも消す */
  downVolumes: boolean;
  /** このワークツリーの DB から作った DB クライアントの接続も消す（消さなければ結び付きだけ外す） */
  dropDbConnections: boolean;
  /** GitHub で PR がマージ済みなら、リモートのブランチも消す（AI の後始末） */
  deleteMergedRemote: boolean;
  /** 頼んだチャット（AI。ゴミ箱の「誰が消したか」。画面からなら null） */
  byChatId: number | null;
}

/** 消した結果 */
export interface FinishResult {
  worktrees: GitWorktree[];
  outcome: FinishOutcome;
  text: string;
}

export interface WorktreeRemoverDeps {
  store: Pick<WorktreeStores, "worktreeEnvs"> & Pick<ChatStoreDeps, "projects" | "chats" | "trash">;
  runner: ChatRunPort;
  moveWorkplace: WorkplaceMoveApi["move"];
  envs: WorktreeEnvService;
  /** compose のファイルがあるか（「コンテナとデータも消す」で組を共有していたかの見分け） */
  compose: Pick<ComposeReader, "findFiles">;
  trashBin: TrashApi;
  workplace: Pick<WorkplaceKit, "git" | "projectScopes">;
  mergeChecks: readonly MergeCheck[];
  events: WorktreeEvents;
}

export class WorktreeRemover {
  constructor(private readonly deps: WorktreeRemoverDeps) {}

  /**
   * そのワークツリーを作業場所にしているチャットの持ち主（プロジェクトと、そのプロジェクトから見た作業場所）。同じリポジトリの中の別のフォルダを本体にしている
   * プロジェクトも、同じワークツリーの中で作業していることがある（ブランチが同じなら使い回す）ので、リポジトリの一番上（本体の root）の下にあるプロジェクトをすべて見る
   */
  usersOf(worktree: GitWorktree, list: GitWorktree[]) {
    const top = list.find((w) => w.main)?.root;
    if (!top) return [];
    // 登録したパスがシンボリックリンクを含むこともある（/var → /private/var）ので、実体で比べる
    return this.deps.store.projects.list()
      .map((p) => ({ id: p.id, real: realPathOrSelf(p.repo_path) }))
      .filter((p) => p.real === top || p.real.startsWith(`${top}/`))
      .map((p) => ({ projectId: p.id, path: path.join(worktree.root, path.relative(top, p.real)) }));
  }

  /** そのワークツリーで作業中のチャットがあるか（settling: 作業の終わりにすること（この片付けを待つ予約した移動）の間は数えないチャット） */
  busyIn(users: { projectId: number; path: string }[], settling: number | null = null) {
    return users.some((u) => this.deps.store.chats.inWorktree(u.projectId, u.path).some((r) => this.deps.runner.isBusy(r.id) && !(r.id === settling && this.deps.runner.live(r.id).phase === "settling")));
  }

  /** 消す前の確かめ（プロジェクトの頼みの包みの中で） */
  inspect(project: Project, worktree: GitWorktree, list: GitWorktree[]) {
    return this.deps.workplace.projectScopes.run(project, () => inspectWorktree(project, worktree, list, this.deps.mergeChecks));
  }

  /** 消したブランチの追いかけ先（「origin/feat-x」。なければ origin の同じ名前。remote がなければ null） */
  private async remoteBranchOf(repo: string, branch: string): Promise<{ remote: string; branch: string } | null> {
    const upstream = await upstreamOf(repo, branch);
    if (upstream) return upstream;
    const remotes = await listRemotes(repo).catch((): string[] => []);
    return remotes.includes("origin") ? { remote: "origin", branch } : null;
  }

  /** 取り込み済みのブランチのリモートを消す（残っていなければ何もしない = null） */
  private async deleteMergedRemote(repo: string, upstream: { remote: string; branch: string }): Promise<FinishOutcome["remote"]> {
    const name = `${upstream.remote}/${upstream.branch}`;
    try {
      const listed = await this.deps.workplace.git(repo, { timeout: 60_000 }).run(["ls-remote", "--heads", upstream.remote, upstream.branch]);
      if (!listed.trim()) return null;
      await this.deps.workplace.git(repo, { timeout: 60_000 }).run(["push", upstream.remote, "--delete", upstream.branch]);
      return { name, error: null };
    } catch (e) {
      return { name, error: errorMessage(e).split("\n")[0] };
    }
  }

  /**
   * ワークツリーを消す（画面の API と AI の後始末で共通）。そこで作業中のチャットがあれば 409。失うもの（force でコミットしていない変更・
   * deleteBranch で取り込んでいないコミット）があれば、消す前に控えに入れて Kickoff のゴミ箱に 3 日残す。消えたら、そこで作業していたチャット
   * （同じリポジトリのほかのプロジェクトのものも）を本体に戻してお知らせを残し、ポートの帯・Docker の組を片付けて、消した知らせを流す（DB の接続の結び付き・PR の知らせ）
   */
  async remove(project: Project, folder: string, opts: FinishOptions): Promise<FinishResult> {
    return this.deps.workplace.projectScopes.run(project, () => this.removeAs(project, folder, opts));
  }

  private async removeAs(project: Project, folder: string, opts: FinishOptions): Promise<FinishResult> {
    const { store, trashBin, envs, events } = this.deps;
    const repo = project.repo_path;
    const list = await listWorktrees(repo, { fresh: true });
    const target = list.find((w) => w.path === folder);
    const users = target ? this.usersOf(target, list) : [{ projectId: project.id, path: folder }];
    if (this.busyIn(users, opts.byChatId)) throw new Conflict("このワークツリーで作業中のチャットがあります。終わってから消してください");
    if (!target) throw new NotFound("ワークツリーが見つかりません");
    if (target.main) throw new Invalid("本体のフォルダは消せません");
    const facts = await inspectWorktree(project, target, list, this.deps.mergeChecks);
    // 控え（失うものだけ）
    const loseChanges = opts.force && facts.changes > 0;
    const loseCommits = opts.deleteBranch && facts.merged === null && facts.unmerged > 0 && facts.tip !== null;
    let trashId: string | null = null;
    if (loseChanges || loseCommits) {
      const snapshot = loseChanges ? await snapshotWorkingTree(target.root) : null;
      const loss = lossText({ ...facts, changes: loseChanges ? facts.changes : 0, unmerged: loseCommits ? facts.unmerged : 0 });
      const details: WorktreeTrashDetails = { branch: facts.branch, head: target.head || null, has_branch_ref: loseCommits, has_changes_ref: snapshot !== null };
      const item = trashBin.addRecord({
        project_id: project.id,
        kind: "worktree",
        label: `ワークツリー ${facts.branch ?? path.basename(target.root)}${loss ? `（${loss}）` : ""}`,
        by_chat_id: opts.byChatId,
        details: { ...details },
      });
      try {
        await saveTrashRefs(repo, item.id, { branch: loseCommits ? facts.tip : null, changes: snapshot });
      } catch (e) {
        store.trash.remove(item.id);
        throw e;
      }
      trashId = item.id;
    }
    // ブランチを消すと追いかけ先の設定も消えるので、先に読んでおく
    const upstream = opts.deleteMergedRemote && facts.merged?.via === "github" && facts.branch ? await this.remoteBranchOf(repo, facts.branch) : null;
    const envBefore = store.worktreeEnvs.get(folder);
    const ownCompose = (envBefore?.compose_names.length ?? 0) > 0;
    const hasCompose = !target.prunable && this.deps.compose.findFiles(target.path).length > 0;
    const moved = users.flatMap((u) => store.chats.inWorktree(u.projectId, u.path));
    // そこで作業していたチャットを本体に戻す。作業フォルダが変わるので、作業場所を移すのと同じく会話を新しいセッションに写して区切りを置く
    // （区切りの 1 行と AI への知らせに、片付けたことと控えに入れたかを書く）。ゴミ箱のチャットは付け替えるだけ
    const clearChats = async () => {
      for (const chat of moved) await this.deps.moveWorkplace(chat.id, { worktreePath: null, reason: "worktree_finished", backedUp: loseChanges, finishedBranch: facts.branch }).catch(() => {});
      for (const u of users) store.chats.clearWorktree(u.projectId, u.path, facts.branch);
    };
    let worktrees: GitWorktree[];
    try {
      worktrees = await removeWorktree(repo, folder, { force: opts.force, deleteBranch: opts.deleteBranch });
    } catch (e) {
      // 一覧も取れなければ、消えたか分からないので戻さない。消えていなければ控えも取り消す
      const gone = await findWorktree(repo, folder).then((w) => !w, () => false);
      if (gone) await clearChats();
      else if (trashId) {
        await dropTrashRefs(repo, trashId);
        store.trash.remove(trashId);
      }
      throw e;
    }
    await clearChats();
    // コンテナとデータ（選ばれたとき。Kickoff が割り当てた組だけ。組の名前で消すのでフォルダがなくてよい）を片付け、帯を空ける。消せなかった組は記録に残す
    const failed = await envs.release(folder, { downVolumes: opts.downVolumes });
    if (failed.length) console.warn("[worktree-env] コンテナとデータを消せませんでした", failed);
    const docker: FinishOutcome["docker"] = !opts.downVolumes ? "none" : ownCompose && failed.length === 0 ? "removed" : !ownCompose && hasCompose ? "kept_shared" : "none";
    // このワークツリーの DB から作った接続（選ばれたら消す。残すなら結び付きだけ外す。database が受ける）
    events.removed({ project_id: project.id, path: folder, branch: facts.branch, drop_db_connections: opts.dropDbConnections });
    const remote = upstream ? await this.deleteMergedRemote(repo, upstream) : null;
    // そのワークツリーの PR の知らせ・印を消す（GitHub には聞き直さない。github が受ける）
    await events.changed();
    const outcome: FinishOutcome = { branch: facts.branch, changes: facts.changes, merged: facts.merged, unmerged: facts.unmerged, trashId, docker, remote, chats: moved.length };
    return { worktrees, outcome, text: finishedText(outcome) };
  }
}
