// ワークツリーの PR の見張り: ワークツリーのブランチの PR が GitHub でマージされた・マージせずに閉じられたことに気づいて、画面に知らせる。
// 前に「開いている」のを見たかは問わず、いまの状態で決める（Kickoff を閉じている間・この機能を入れる前にマージされたものも、ワークツリーが残っていれば知らせる）
import type { BusEvent, GitWorktree, Project, WorktreePrNotice } from "@shared/types";
import type { Store } from "../db/store.js";
import type { BranchPullRequest } from "./github.js";
import { runAsGitHubAccount } from "./githubAccount.js";
import { resolveGitHubTarget, type GitHubTarget } from "./githubTarget.js";
import { isGitWorkTree } from "./status.js";

/** 見張る間隔（5 分。ほかに、画面の窓に戻ったときも取り直す） */
export const PR_WATCH_INTERVAL_MS = 5 * 60_000;
/** 窓に戻ったときの取り直しを、この間はまとめる（窓を行き来するたびに GitHub に聞かない） */
const REFRESH_MIN_MS = 30_000;

/**
 * ワークツリーと PR の一覧から知らせを作る（純粋な関数）。本体・ブランチのないワークツリーは見ない。
 * ブランチごとにいちばん新しい PR（番号の大きいもの。手元のブランチのプッシュ先の持ち主 headOwner のものだけ。ほかの fork からの同じ名前の PR は除く）が、
 * マージ済み・閉じたなら知らせる（開いていれば何もしない）
 */
export function noticesFor(
  projectId: number,
  worktrees: GitWorktree[],
  prs: BranchPullRequest[],
  opts: { dismissed: Set<number>; headOwner: string },
): WorktreePrNotice[] {
  const notices: WorktreePrNotice[] = [];
  for (const w of worktrees) {
    if (w.main || !w.branch) continue;
    const own = (p: BranchPullRequest) => p.branch === w.branch && p.head_owner.toLowerCase() === opts.headOwner.toLowerCase();
    const latest = prs.filter(own).sort((a, b) => b.number - a.number)[0];
    if (!latest || latest.state === "OPEN") continue;
    notices.push({
      project_id: projectId,
      worktree: w.path,
      branch: w.branch,
      pr: { number: latest.number, title: latest.title, url: latest.url, state: latest.state },
      dismissed: opts.dismissed.has(latest.number),
    });
  }
  return notices;
}

interface WatchOptions {
  store: Store;
  publish: (event: BusEvent) => void;
  /** ワークツリーの一覧（git worktree list）と、PR の一覧（gh pr list）。テストでは差し替える */
  listWorktrees: (repo: string) => Promise<GitWorktree[]>;
  listPullRequests: (repo: string, target: GitHubTarget) => Promise<BranchPullRequest[]>;
  /** 連携先の GitHub のリポジトリ（git の remote とプロジェクトの選択から。GitHub でなければ null。テストでは差し替える） */
  resolveTarget?: (repo: string, chosen: string | null) => Promise<GitHubTarget | null>;
  /** フォルダが Git で管理されているか（テストでは差し替える） */
  isGitRepo?: (repo: string) => Promise<boolean>;
  /**
   * 同じ間隔で、プロジェクトごとに一緒に確かめるもの（CI の失敗の見張り。ワークツリーの有無・PR の見張りの設定によらず、GitHub に聞くときだけ呼ぶ。
   * 失敗してもほかの確かめは止めない）
   */
  alsoCheck?: (project: Project) => Promise<void>;
}

/**
 * ワークツリーの PR の見張り。5 分ごとと、画面が窓に戻ったときに、ワークツリーのあるプロジェクトだけ GitHub に 1 回ずつ聞く
 * （プロジェクトの設定で見張らないことにしたもの・GitHub の remote がないものは聞かない。連携先の remote・アカウントはプロジェクトの選択のとおり）
 * （ワークツリーがなければ聞かない。gh がない・ログインしていない・GitHub でないなどで聞けなければ、そのプロジェクトは前の知らせのまま）。
 * 知らせはメモリに持ち、変わったら SSE の worktree_prs で配る。ワークツリーを消したときは、GitHub に聞き直さずに覚えた PR の一覧で作り直す
 */
export class WorktreePrWatch {
  private readonly opts: WatchOptions;
  private readonly notices = new Map<number, WorktreePrNotice[]>();
  /** プロジェクトごとに最後に取った PR の一覧と、手元のブランチのプッシュ先の持ち主（ワークツリーを消したときの作り直しに使う） */
  private readonly prs = new Map<number, { prs: BranchPullRequest[]; headOwner: string }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private lastRun = 0;

  constructor(opts: WatchOptions) {
    this.opts = opts;
  }

  start() {
    void this.checkAll();
    this.timer = setInterval(() => void this.checkAll(), PR_WATCH_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** いまの知らせ（すべてのプロジェクト） */
  list(): WorktreePrNotice[] {
    return [...this.notices.values()].flat();
  }

  /** 画面が窓に戻ったとき（30 秒以内の続けての取り直しはまとめる）。取り直したあとの知らせを返す */
  async refresh(): Promise<WorktreePrNotice[]> {
    if (this.running) await this.running;
    else if (Date.now() - this.lastRun >= REFRESH_MIN_MS) await this.checkAll();
    return this.list();
  }

  /** すべてのプロジェクトを GitHub に聞いて確かめる（同時に頼まれても 1 回） */
  checkAll(): Promise<void> {
    this.running ??= (async () => {
      this.lastRun = Date.now();
      const projects = this.opts.store.projects.list().filter((p) => p.archived_at === null);
      const alive = new Set(projects.map((p) => p.id));
      for (const id of [...this.notices.keys()]) if (!alive.has(id)) this.set(id, []);
      for (const project of projects) await this.check(project, true).catch(() => undefined);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** ワークツリーを消したあと: GitHub に聞き直さず、覚えた PR の一覧で、いまのワークツリーから知らせを作り直す（すべてのプロジェクト） */
  async recomputeAll(): Promise<void> {
    for (const project of this.opts.store.projects.list()) {
      if (this.notices.has(project.id)) await this.check(project, false).catch(() => undefined);
    }
  }

  /** プロジェクトの GitHub の連携（アカウント・連携先・見張るか）を変えたとき: そのプロジェクトだけ聞き直す */
  async checkProject(projectId: number): Promise<void> {
    const project = this.opts.store.projects.get(projectId);
    if (!project) return this.set(projectId, []);
    this.prs.delete(projectId);
    await this.check(project, true).catch(() => undefined);
  }

  /** 確認を閉じた（同じ PR では確認を出し直さない） */
  dismiss(projectId: number, prNumber: number) {
    this.opts.store.prNotices.dismiss(projectId, prNumber);
    const current = this.notices.get(projectId) ?? [];
    this.set(
      projectId,
      current.map((n) => (n.pr.number === prNumber ? { ...n, dismissed: true } : n)),
    );
  }

  /** プロジェクトを確かめる（見張らない設定・Git でない・GitHub の remote がなければ知らせなし。gh は選んだアカウントで動かす） */
  private async check(project: Project, ask: boolean): Promise<void> {
    await runAsGitHubAccount(project.github_account, () => this.checkAs(project, ask)).catch(() => undefined);
    if (ask && project.archived_at === null) await this.opts.alsoCheck?.(project).catch(() => undefined);
  }

  private async checkAs(project: Project, ask: boolean) {
    const { id: projectId, repo_path: repo } = project;
    if (!project.pr_watch || project.archived_at !== null) {
      this.prs.delete(projectId);
      return this.set(projectId, []);
    }
    if (!(await (this.opts.isGitRepo ?? isGitWorkTree)(repo))) return this.set(projectId, []);
    const worktrees = (await this.opts.listWorktrees(repo)).filter((w) => !w.main && w.branch && !w.prunable);
    if (worktrees.length === 0) {
      this.prs.delete(projectId);
      this.opts.store.prNotices.keepOnly(projectId, []);
      return this.set(projectId, []);
    }
    let known = this.prs.get(projectId);
    if (ask || !known) {
      const target = await (this.opts.resolveTarget ?? resolveGitHubTarget)(repo, project.github_remote);
      if (!target) {
        this.prs.delete(projectId);
        return this.set(projectId, []);
      }
      known = { prs: await this.opts.listPullRequests(repo, target), headOwner: target.headOwner };
      this.prs.set(projectId, known);
    }
    const { store } = this.opts;
    const notices = noticesFor(projectId, worktrees, known.prs, { dismissed: store.prNotices.dismissed(projectId), headOwner: known.headOwner });
    // 片付けて知らせがなくなった PR は、閉じた覚えも消す
    store.prNotices.keepOnly(
      projectId,
      notices.map((n) => n.pr.number),
    );
    this.set(projectId, notices);
  }

  /** 知らせを入れ替え、変わったときだけ配る */
  private set(projectId: number, notices: WorktreePrNotice[]) {
    const before = this.notices.get(projectId) ?? [];
    if (notices.length === 0) this.notices.delete(projectId);
    else this.notices.set(projectId, notices);
    if (JSON.stringify(before) !== JSON.stringify(notices)) this.opts.publish({ type: "worktree_prs", project_id: projectId, notices });
  }
}
