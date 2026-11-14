// ワークツリーの後始末（メモの仕様書「0019_AI の操作ツールの追加」の F）: 画面の「ワークツリーを消す」と AI の finish_worktree の両方がここを通る。
// 消す前に確かめ（コミットしていない変更・取り込み済みか）、失うものがあれば Git の控え（refs/kickoff/trash/…）に入れて Kickoff のゴミ箱に 3 日残し、
// ワークツリー・ブランチ・ポートの帯・Docker の組（そのワークツリーだけのもの）・PR の知らせを片付け、そこで作業していたチャットを本体に戻す。
// ワークツリー自身のチャットから頼まれたら、そのチャットの作業が終わってから消す（予約）
import path from "node:path";
import type { GitWorktree, Project } from "@shared/types";
import { errorMessage } from "@shared/errors";
import type { Bus } from "../bus.js";
import type { Runner } from "../chat/runner.js";
import type { DatabaseService } from "../databases/service.js";
import type { Store } from "../db/store.js";
import type { StoredTrashItem } from "../db/trash.js";
import { findComposeFiles } from "../docker/compose.js";
import { gitOutput } from "../git/exec.js";
import { mergedPullRequestOf, type MergedPullRequest } from "../git/github.js";
import { runAsGitHubAccount } from "../git/githubAccount.js";
import { resolveGitHubTarget } from "../git/githubTarget.js";
import { addWorktree, findWorktree, isGitWorkTree, listWorktrees, removeWorktree } from "../git/index.js";
import type { WorktreePrWatch } from "../git/prWatch.js";
import { hasRef } from "../git/status.js";
import { Conflict, Invalid, NotFound } from "../http/errors.js";
import { realPathOrSelf } from "../system/paths.js";
import type { TrashService } from "../trash/service.js";
import type { WorktreeEnvService } from "../worktreeEnv/service.js";
import { applySnapshot, dropTrashRefs, saveTrashRefs, snapshotWorkingTree, trashRef } from "./backup.js";
import { finishedText, lossText, movedToMainNotice, plannedText, type FinishFacts, type FinishOutcome } from "./report.js";

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
  /** GitHub で PR がマージ済みなら、リモートのブランチも消す（AI の後始末。Q12） */
  deleteMergedRemote: boolean;
  /** 頼んだチャット（AI。ゴミ箱の「誰が消したか」。画面からなら null） */
  byChatId: number | null;
}

/** AI の後始末の消し方（消し方は 1 つ。失うものは控えに入れて消す。Docker のデータも・取り込み済みならリモートのブランチも） */
const AI_FINISH: Omit<FinishOptions, "byChatId"> = { force: true, deleteBranch: true, downVolumes: true, dropDbConnections: false, deleteMergedRemote: true };

/** ゴミ箱の行（種類 worktree）に覚えるもの */
interface WorktreeTrashDetails {
  branch: string | null;
  /** 消したときのワークツリーの HEAD（ブランチの控えがないときに作り直す元） */
  head: string | null;
  has_branch_ref: boolean;
  has_changes_ref: boolean;
}

/** 消した結果 */
export interface FinishResult {
  worktrees: GitWorktree[];
  outcome: FinishOutcome;
  text: string;
}

/** 消す前の確かめ（finishedText などの元と、控えに使うブランチの先） */
interface Inspection extends FinishFacts {
  tip: string | null;
}

export interface WorktreeFinisherDeps {
  store: Store;
  bus: Bus;
  runner: Runner;
  worktreeEnvs: WorktreeEnvService;
  databases: DatabaseService;
  prWatch: WorktreePrWatch;
  trashBin: TrashService;
  /** ブランチのマージ済みの PR（GitHub で取り込んだかの見分け。テストでは差し替える。省けば gh に聞く） */
  mergedPr?: (project: Project, branch: string) => Promise<MergedPullRequest | null>;
  /** 予約した後始末を、頼んだチャットの作業が終わるのを待って確かめ直す間隔（テストで縮める） */
  retryMs?: number;
}

/** 祖先か（a が b に含まれるか。どちらかがなければ false） */
const isAncestor = (repo: string, a: string, b: string) =>
  gitOutput(repo, ["merge-base", "--is-ancestor", a, b]).then(
    () => true,
    () => false,
  );

/** ブランチのマージ済みの PR を gh に聞く（GitHub の remote がない・聞けなければ null） */
async function askMergedPr(project: Project, branch: string): Promise<MergedPullRequest | null> {
  const target = await resolveGitHubTarget(project.repo_path, project.github_remote).catch(() => null);
  if (!target) return null;
  return mergedPullRequestOf(project.repo_path, target, branch).catch(() => null);
}

export class WorktreeFinisher {
  /** 予約した後始末（頼んだチャット → プロジェクトとワークツリーのフォルダ） */
  private readonly reserved = new Map<number, { projectId: number; folder: string }>();
  private readonly unsubscribe: () => void;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: WorktreeFinisherDeps) {
    // 作業が終わったら（作業中でなくなった知らせ）予約を確かめる。予約したチャットなら、送信待ちを先に止める（ワークツリーで動くつもりで書いた指示が、本体で勝手に動かないように）
    this.unsubscribe = deps.bus.subscribe((e) => {
      if (e.type !== "chat" || e.chat.status === "running" || this.reserved.size === 0) return;
      if (this.reserved.has(e.chat.id)) void deps.runner.setQueuePaused(e.chat.id, true);
      this.schedule();
    });
    // ゴミ箱から戻す: 同じ名前でワークツリーを作り直し、ブランチと途中の変更を戻す。3 日たったら控えの参照を消す
    deps.trashBin.register("worktree", { restore: (item) => this.restore(item), purge: (item) => this.purge(item) });
  }

  close() {
    this.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * そのワークツリーを作業場所にしているチャットの持ち主（プロジェクトと、そのプロジェクトから見た作業場所）。
   * 同じリポジトリの中の別のフォルダを本体にしているプロジェクトも、同じワークツリーの中で作業していることがある（ブランチが同じなら使い回す）ので、
   * リポジトリの一番上（本体の root）の下にあるプロジェクトをすべて見る
   */
  private usersOf(worktree: GitWorktree, list: GitWorktree[]) {
    const top = list.find((w) => w.main)?.root;
    if (!top) return [];
    // 登録したパスがシンボリックリンクを含むこともある（/var → /private/var）ので、実体で比べる
    return this.deps.store.projects
      .list()
      .map((p) => ({ id: p.id, real: realPathOrSelf(p.repo_path) }))
      .filter((p) => p.real === top || p.real.startsWith(`${top}/`))
      .map((p) => ({ projectId: p.id, path: path.join(worktree.root, path.relative(top, p.real)) }));
  }

  /** そのワークツリーで作業中のチャットがあるか */
  private busyIn(users: { projectId: number; path: string }[]) {
    return users.some((u) => this.deps.store.chats.inWorktree(u.projectId, u.path).some((r) => this.deps.runner.isBusy(r.id)));
  }

  /** 消す前の確かめ（コミットしていない変更・取り込み済みか・取り込んでいないコミット）。断るためでなく、何を控えに入れたか・取り込み済みかを伝えるため */
  private async inspect(project: Project, worktree: GitWorktree, list: GitWorktree[]): Promise<Inspection> {
    const repo = project.repo_path;
    const ok = (p: Promise<string>) => p.then((out) => out.trim(), () => "");
    const changes = worktree.prunable ? 0 : (await ok(gitOutput(worktree.root, ["status", "--porcelain"]))).split("\n").filter(Boolean).length;
    const branch = worktree.branch;
    const tip = (branch ? await ok(gitOutput(repo, ["rev-parse", `refs/heads/${branch}`])) : worktree.head) || null;
    const main = list.find((w) => w.main);
    const into = main?.branch ?? null;
    const mainRef = into ? `refs/heads/${into}` : (main?.head ?? null);
    if (!tip || !mainRef) return { branch, changes, merged: null, unmerged: 0, tip };
    const unmerged = Number(await ok(gitOutput(repo, ["rev-list", "--count", tip, "--not", mainRef]))) || 0;
    // ローカルで取り込んだ: ブランチの先が本体のブランチに含まれている
    if (await isAncestor(repo, tip, mainRef)) return { branch, changes, merged: { via: "local", into: into ?? "本体" }, unmerged: 0, tip };
    // GitHub などで取り込んだ: PR がマージ済みで、PR に入った最後のコミットのあとに手元で足したコミットがない（squash・rebase でマージしても見分けられる）
    if (branch) {
      const pr = await (this.deps.mergedPr ?? askMergedPr)(project, branch).catch(() => null);
      if (pr && (pr.head_sha === tip || (await isAncestor(repo, tip, pr.head_sha)))) return { branch, changes, merged: { via: "github", pr: pr.number }, unmerged, tip };
    }
    return { branch, changes, merged: null, unmerged, tip };
  }

  /** 消したブランチの追いかけ先（「origin/feat-x」。なければ origin の同じ名前。remote がなければ null） */
  private async upstreamOf(repo: string, branch: string): Promise<{ remote: string; branch: string } | null> {
    const upstream = await gitOutput(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", `${branch}@{upstream}`]).then((out) => out.trim(), () => "");
    const slash = upstream.indexOf("/");
    if (slash > 0) return { remote: upstream.slice(0, slash), branch: upstream.slice(slash + 1) };
    const remotes = (await gitOutput(repo, ["remote"]).catch(() => "")).split("\n").filter(Boolean);
    return remotes.includes("origin") ? { remote: "origin", branch } : null;
  }

  /** リモートのブランチを消す（残っていなければ何もしない = null） */
  private async deleteRemote(repo: string, upstream: { remote: string; branch: string }): Promise<FinishOutcome["remote"]> {
    const name = `${upstream.remote}/${upstream.branch}`;
    try {
      const listed = await gitOutput(repo, ["ls-remote", "--heads", upstream.remote, upstream.branch], [], 60_000);
      if (!listed.trim()) return null;
      await gitOutput(repo, ["push", upstream.remote, "--delete", upstream.branch], [], 60_000);
      return { name, error: null };
    } catch (e) {
      return { name, error: errorMessage(e).split("\n")[0] };
    }
  }

  /**
   * ワークツリーを消す（画面の API と AI の後始末で共通）。そこで作業中のチャットがあれば 409。失うもの（force でコミットしていない変更・
   * deleteBranch で取り込んでいないコミット）があれば、消す前に控えに入れて Kickoff のゴミ箱に 3 日残す。消えたら、そこで作業していたチャット
   * （同じリポジトリのほかのプロジェクトのものも）を本体に戻してお知らせを残し、ポートの帯・Docker の組・DB の接続の結び付き・PR の知らせを片付ける
   */
  async remove(project: Project, folder: string, opts: FinishOptions): Promise<FinishResult> {
    return runAsGitHubAccount(project.github_account, () => this.removeAs(project, folder, opts));
  }

  private async removeAs(project: Project, folder: string, opts: FinishOptions): Promise<FinishResult> {
    const { store, trashBin, worktreeEnvs, databases, prWatch } = this.deps;
    const repo = project.repo_path;
    const list = await listWorktrees(repo);
    const target = list.find((w) => w.path === folder);
    const users = target ? this.usersOf(target, list) : [{ projectId: project.id, path: folder }];
    if (this.busyIn(users)) throw new Conflict("このワークツリーで作業中のチャットがあります。終わってから消してください");
    if (!target) throw new NotFound("ワークツリーが見つかりません");
    if (target.main) throw new Invalid("本体のフォルダは消せません");
    const facts = await this.inspect(project, target, list);
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
    const upstream = opts.deleteMergedRemote && facts.merged?.via === "github" && facts.branch ? await this.upstreamOf(repo, facts.branch) : null;
    const envBefore = store.worktreeEnvs.get(folder);
    const ownCompose = (envBefore?.compose_names.length ?? 0) > 0;
    const hasCompose = !target.prunable && findComposeFiles(target.path).length > 0;
    const moved = users.flatMap((u) => store.chats.inWorktree(u.projectId, u.path));
    const clearChats = () => {
      for (const u of users) store.chats.clearWorktree(u.projectId, u.path);
    };
    let worktrees: GitWorktree[];
    try {
      worktrees = await removeWorktree(repo, folder, { force: opts.force, deleteBranch: opts.deleteBranch });
    } catch (e) {
      // 一覧も取れなければ、消えたか分からないので戻さない。消えていなければ控えも取り消す
      const gone = await findWorktree(repo, folder).then((w) => !w, () => false);
      if (gone) clearChats();
      else if (trashId) {
        await dropTrashRefs(repo, trashId);
        store.trash.remove(trashId);
      }
      throw e;
    }
    clearChats();
    // 本体に戻したチャットには、頼んだチャット自身（ワークツリー自身から予約したとき）も含めて「次からは本体で動きます」を残す（結果のお知らせはこのあと頼んだチャットに別に残す）
    for (const chat of moved) store.events.add(chat.id, { type: "notice", message: movedToMainNotice(facts.branch) });
    // コンテナとデータ（選ばれたとき。Kickoff が割り当てた組だけ。組の名前で消すのでフォルダがなくてよい）を片付け、帯を空ける。消せなかった組は記録に残す
    const failed = await worktreeEnvs.release(folder, { downVolumes: opts.downVolumes });
    if (failed.length) console.warn("[worktree-env] コンテナとデータを消せませんでした", failed);
    const docker: FinishOutcome["docker"] = !opts.downVolumes ? "none" : ownCompose && failed.length === 0 ? "removed" : !ownCompose && hasCompose ? "kept_shared" : "none";
    // このワークツリーの DB から作った接続（選ばれたら消す。残すなら結び付きだけ外す）
    if (opts.dropDbConnections) for (const conn of store.dbConnections.ofWorktree(folder)) databases.removeConnection(conn.id);
    else store.dbConnections.clearWorktree(folder);
    const remote = upstream ? await this.deleteRemote(repo, upstream) : null;
    // そのワークツリーの PR の知らせ・印を消す（GitHub には聞き直さない）
    await prWatch.recomputeAll();
    const outcome: FinishOutcome = { branch: facts.branch, changes: facts.changes, merged: facts.merged, unmerged: facts.unmerged, trashId, docker, remote, chats: moved.length };
    return { worktrees, outcome, text: finishedText(outcome) };
  }

  /**
   * AI の finish_worktree（利用者が頼んだときだけ。カードなし）。頼んだチャットが本体のチャットなら、指したワークツリー（同じプロジェクトのどれでも）を
   * その場で消す（作業中のチャットがあれば断る）。ワークツリー自身のチャットなら、確かめだけをして予約し、このチャットの作業が終わってから消す。
   * ほかのワークツリーのチャットからは消せない。AI に返す文を返す（できなければ理由の文で throw）
   */
  async finishFromChat(chatId: number, worktree: string | undefined): Promise<string> {
    const { store } = this.deps;
    const chat = store.chats.get(chatId);
    if (!chat) throw new Error("このチャットが見つかりません（消された可能性があります）");
    const project = store.projects.get(chat.project_id);
    if (!project) throw new Error("このチャットのプロジェクトが見つかりません");
    if (!(await isGitWorkTree(project.repo_path).catch(() => false))) throw new Error("このプロジェクトは Git で管理していないので、ワークツリーはありません");
    const list = await listWorktrees(project.repo_path);
    const named = worktree?.trim() ? list.find((w) => [w.path, w.root, w.branch, path.basename(w.root)].includes(worktree.trim())) : undefined;
    if (worktree?.trim() && !named) throw new Error(`ワークツリー「${worktree}」が見つかりません。いまあるワークツリー: ${worktreeNames(list)}`);
    if (chat.worktree_path !== null) {
      const own = list.find((w) => w.path === chat.worktree_path);
      if (!own) throw new Error("このチャットのワークツリーが見つかりません（もう消えたかもしれません）");
      if (named && named.path !== own.path) throw new Error("ほかのワークツリーのチャットからは消せません。消せるのは、このチャットのワークツリーだけです（本体のチャットからなら、どのワークツリーでも消せます）");
      const facts = await runAsGitHubAccount(project.github_account, () => this.inspect(project, own, list));
      this.reserved.set(chatId, { projectId: project.id, folder: own.path });
      const others = this.usersOf(own, list).flatMap((u) => store.chats.inWorktree(u.projectId, u.path)).some((c) => c.id !== chatId && this.deps.runner.isBusy(c.id));
      return [
        `予約しました。このチャットの作業が終わったら${others ? "（同じワークツリーで作業中のほかのチャットも終わるのを待ってから）" : ""}、Kickoff がこのワークツリーを片付けます。`,
        plannedText(facts),
        "片付けたあと、このチャットは本体で動きます。送信待ちが残っていれば止めておきます（ワークツリーで動くつもりの指示が本体で勝手に動かないように）。結果はこのチャットのお知らせに出ます。",
      ].join("\n");
    }
    if (!named) throw new Error(`消すワークツリー（worktree: ブランチの名前かフォルダ）を指してください。いまあるワークツリー: ${worktreeNames(list)}`);
    if (named.main) throw new Error("本体のフォルダは消せません");
    try {
      const result = await this.remove(project, named.path, { ...AI_FINISH, byChatId: chatId });
      store.events.add(chatId, { type: "notice", message: result.text });
      return result.text;
    } catch (e) {
      if (e instanceof Conflict) throw new Error("このワークツリーで作業中のチャットがあるので消せません（待たずに断りました）。作業が終わってから、もう一度頼んでください");
      throw e;
    }
  }

  /** 予約を確かめる（少し待ってから。頼んだチャットの作業の後始末が済むまで） */
  private schedule(delay = 0) {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runReserved();
    }, delay);
  }

  /** 予約した後始末のうち、頼んだチャットとそのワークツリーで作業中のチャットがなくなったものを消し、結果を頼んだチャットのお知らせに残す */
  private async runReserved() {
    const { store, runner } = this.deps;
    let waiting = false;
    for (const [chatId, r] of [...this.reserved]) {
      const chat = store.chats.get(chatId);
      const project = store.projects.get(r.projectId);
      if (!chat || !project) {
        this.reserved.delete(chatId);
        continue;
      }
      // 作業の終わりの知らせは、作業の後始末より先に届くので、作業中でなくなるまで待つ
      if (runner.isBusy(chatId)) {
        waiting = chat.status !== "running";
        continue;
      }
      const list = await listWorktrees(project.repo_path).catch((): GitWorktree[] => []);
      const target = list.find((w) => w.path === r.folder);
      if (target && this.busyIn(this.usersOf(target, list))) continue;
      this.reserved.delete(chatId);
      try {
        const result = await this.remove(project, r.folder, { ...AI_FINISH, byChatId: chatId });
        store.events.add(chatId, { type: "notice", message: result.text });
      } catch (e) {
        store.events.add(chatId, { type: "notice", message: `ワークツリーを片付けられませんでした（${errorMessage(e)}）` });
      }
    }
    if (waiting) this.schedule(this.deps.retryMs ?? 100);
  }

  /** ゴミ箱から戻す: 同じ名前のブランチ（なければ控えのブランチの先から作る）でワークツリーを作り直し、途中の変更を戻す */
  private async restore(item: StoredTrashItem) {
    const details = item.details as unknown as WorktreeTrashDetails;
    const project = item.project_id !== null ? this.deps.store.projects.get(item.project_id) : undefined;
    if (!project) throw new NotFound("ワークツリーのプロジェクトが見つかりません");
    if (!details.branch) throw new Invalid("ブランチのないワークツリーは戻せません");
    const repo = project.repo_path;
    if (!(await hasRef(repo, `refs/heads/${details.branch}`))) {
      const from = details.has_branch_ref ? trashRef(item.id, "branch") : details.head;
      if (!from) throw new Invalid("ワークツリーのブランチの先が分からないので戻せません");
      await gitOutput(repo, ["branch", details.branch, from]);
    }
    const list = await addWorktree(repo, details.branch, (made) => this.deps.worktreeEnvs.prepare(project, made));
    const made = list.find((w) => w.branch === details.branch && !w.main);
    if (made && details.has_changes_ref) await applySnapshot(made.root, trashRef(item.id, "changes"));
    await dropTrashRefs(repo, item.id);
    await this.deps.prWatch.recomputeAll();
  }

  /** 3 日たったら控えの参照を消す */
  private async purge(item: StoredTrashItem) {
    const project = item.project_id !== null ? this.deps.store.projects.get(item.project_id) : undefined;
    if (project) await dropTrashRefs(project.repo_path, item.id);
  }
}

/** ワークツリーの一覧の文（AI に選んでもらうため。本体は除く） */
function worktreeNames(list: GitWorktree[]): string {
  const names = list.filter((w) => !w.main).map((w) => w.branch ?? w.path);
  return names.length > 0 ? names.join("、") : "（なし）";
}
