// CI の結果（GitHub Actions の実行・ジョブ・ステップ・ログ・やり直し・直すチャットの作業場所・失敗の見張り）。メモの仕様書「CI の結果」の ①〜⑥。
// GitHub タブと同じく、プロジェクトの連携先にプロジェクトのアカウントで gh で聞く（GitHubService.within）。ログ・やり直し・作業場所は Actions だけで、
// 外の CI（CircleCI・Vercel など）は GitHub に来る成否とリンクだけを並べる。中身は DB に持たない（知らせた実行だけ覚える）
import type { CiFailedLog, CiFailure, CiJobLog, CiRun, CiRunDetail, CiRunList, CiRunWorktree, GitHubRemote, GitWorktree, Project } from "@shared/types";
import type { Store } from "../db/store.js";
import { Invalid, NotFound } from "../http/errors.js";
import { checkoutPullWorktree } from "../git/pullWorktree.js";
import { readGitHubRemotes } from "../git/githubTarget.js";
import { isGitWorkTree } from "../git/status.js";
import { listWorktrees } from "../git/worktrees.js";
import { ttlCache } from "../system/ttlCache.js";
import type { GitHubContext } from "./ghApi.js";
import type { GitHubService } from "./service.js";
import { failuresToNotify, parseRunLog, stepLogsOf, stripAnsi, toCiJob, toCiRun, toExternalChecks } from "./ciNormalize.js";

/** 一覧の実行の数（新しいほうから） */
export const CI_RUNS_PAGE = 50;
/** 外の CI を聞くブランチの数の上限（作業場所が多くても、聞きすぎない） */
const EXTERNAL_BRANCHES_MAX = 8;
/** 失敗を知らせるのは、終わってからこの間のものだけ（入れたときに、ずっと前の失敗をまとめて知らせない） */
export const CI_NOTIFY_RECENT_MS = 24 * 3600_000;

interface CiServiceOptions {
  /** 作業場所の一覧（テストでは差し替える） */
  listWorktrees?: (repo: string) => Promise<GitWorktree[]>;
  /** GitHub の remote の一覧（テストでは差し替える） */
  remotes?: (repo: string) => Promise<GitHubRemote[]>;
  isGitRepo?: (repo: string) => Promise<boolean>;
  now?: () => number;
}

export class CiService {
  /** 既定のブランチ（リポジトリごとに 10 分覚える） */
  private readonly defaults = ttlCache<string, string | null>(10 * 60_000);

  constructor(
    private readonly github: GitHubService,
    private readonly opts: CiServiceOptions = {},
  ) {}

  private now() {
    return (this.opts.now ?? Date.now)();
  }

  /** 作業場所（本体・各ワークツリー）でいま取り出しているブランチ（Git でなければ空。切り離した HEAD は数えない） */
  private async workplaceBranches(project: Project): Promise<string[]> {
    if (!(await (this.opts.isGitRepo ?? isGitWorkTree)(project.repo_path))) return [];
    const list = await (this.opts.listWorktrees ?? listWorktrees)(project.repo_path).catch(() => []);
    return [...new Set(list.filter((w) => w.branch && !w.prunable).map((w) => w.branch as string))];
  }

  /** 連携先の既定のブランチ（main など） */
  private async defaultBranch(ctx: GitHubContext): Promise<string | null> {
    const cached = this.defaults.get(ctx.key);
    if (cached !== undefined) return cached;
    const body = (await ctx.api.rest(`repos/${ctx.repo}`)).body as { default_branch?: unknown } | null;
    const branch = typeof body?.default_branch === "string" && body.default_branch ? body.default_branch : null;
    this.defaults.set(ctx.key, branch);
    return branch;
  }

  private async runsOf(ctx: GitHubContext): Promise<CiRun[]> {
    const body = (await ctx.api.rest(`repos/${ctx.repo}/actions/runs?per_page=${CI_RUNS_PAGE}`)).body as { workflow_runs?: unknown[] } | null;
    return (body?.workflow_runs ?? []).map(toCiRun);
  }

  /** CI のタブの一覧: Actions の実行（新しい 50 件）と、見張っているブランチの先頭のコミットの外の CI */
  list(project: Project): Promise<CiRunList> {
    return this.github.within(project, async (ctx) => {
      const [runs, defaultBranch, workplaces] = await Promise.all([this.runsOf(ctx), this.defaultBranch(ctx).catch(() => null), this.workplaceBranches(project)]);
      const branches = [...new Set([...(defaultBranch ? [defaultBranch] : []), ...workplaces])].slice(0, EXTERNAL_BRANCHES_MAX);
      const external = (
        await Promise.all(
          branches.map(async (branch) => {
            const ref = encodeURIComponent(branch);
            const [status, checks] = await Promise.all([
              ctx.api.rest(`repos/${ctx.repo}/commits/${ref}/status`).catch(() => null),
              ctx.api.rest(`repos/${ctx.repo}/commits/${ref}/check-runs?per_page=100`).catch(() => null),
            ]);
            return toExternalChecks(branch, status?.body ?? null, checks?.body ?? null);
          }),
        )
      ).flat();
      return { runs, external, default_branch: defaultBranch, workplace_branches: workplaces, fetched_at: new Date(this.now()).toISOString() };
    });
  }

  private async runOf(ctx: GitHubContext, runId: number): Promise<CiRun> {
    const res = await ctx.api.rest(`repos/${ctx.repo}/actions/runs/${runId}`).catch(() => null);
    if (!res?.body) throw new NotFound(`${ctx.repo} に実行 ${runId} はありません`);
    return toCiRun(res.body);
  }

  /** 実行の中身（ジョブとステップ。最後の試みの分。ジョブの一覧は配列でなく { jobs } の形で返るので、1 ページ 100 件まで） */
  detail(project: Project, runId: number): Promise<CiRunDetail> {
    return this.github.within(project, async (ctx) => {
      const [run, res] = await Promise.all([this.runOf(ctx, runId), ctx.api.rest(`repos/${ctx.repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100`)]);
      const jobs = (res.body as { jobs?: unknown[] } | null)?.jobs ?? [];
      return { run, jobs: jobs.map(toCiJob), fetched_at: new Date(this.now()).toISOString() };
    });
  }

  /**
   * ジョブのログ（ステップごと。gh run view --log）。GitHub は実行が終わるまでログを出さないので、動いている最中・消えたものは available: false と理由
   */
  jobLog(project: Project, runId: number, jobId: number): Promise<CiJobLog> {
    return this.github.within(project, async (ctx) => {
      try {
        const text = await ctx.api.cli(["run", "view", String(runId), "--job", String(jobId), "--log"]);
        return { job_id: jobId, available: true, reason: null, steps: stepLogsOf(text) };
      } catch (e) {
        if (e instanceof Invalid) return { job_id: jobId, available: false, reason: logUnavailableReason(e.message), steps: [] };
        throw e;
      }
    });
  }

  /** 失敗したステップのログ（gh run view --log-failed の範囲。「AI に渡す」の札の中身。色の制御文字は外す） */
  failedLog(project: Project, runId: number): Promise<CiFailedLog> {
    return this.github.within(project, async (ctx) => {
      const run = await this.runOf(ctx, runId);
      if (run.state !== "failure") throw new Invalid("この実行は落ちていないので、失敗したステップのログはありません");
      let text: string;
      try {
        text = await ctx.api.cli(["run", "view", String(runId), "--log-failed"]);
      } catch (e) {
        throw e instanceof Invalid ? new Invalid(logUnavailableReason(e.message)) : e;
      }
      const steps = parseRunLog(text).map((s) => ({ ...s, lines: s.lines.map(stripAnsi) }));
      return { run, steps };
    });
  }

  /** やり直す（failed なら失敗したジョブだけ。動いている最中は GitHub が断る） */
  rerun(project: Project, runId: number, failed: boolean): Promise<void> {
    return this.github.within(project, async (ctx) => {
      await ctx.api.send("POST", `repos/${ctx.repo}/actions/runs/${runId}/${failed ? "rerun-failed-jobs" : "rerun"}`);
    });
  }

  /**
   * 「（ブランチ名）で直す」の作業場所: 既定のブランチなら本体、ほかはそのブランチを取り出している作業場所（本体も）、
   * なければ元のブランチを取ってきてワークツリーを作る（PR の「レビューコメントで直す」と同じ git/pullWorktree.ts）
   */
  worktree(project: Project, runId: number): Promise<CiRunWorktree> {
    return this.github.within(project, async (ctx) => {
      if (!(await (this.opts.isGitRepo ?? isGitWorkTree)(project.repo_path))) throw new Invalid("プロジェクトフォルダを Git で管理していないので、ブランチを取り出せません");
      const res = await ctx.api.rest(`repos/${ctx.repo}/actions/runs/${runId}`).catch(() => null);
      const raw = res?.body as { head_branch?: unknown; head_repository?: { full_name?: unknown } | null; pull_requests?: { number?: unknown }[] } | null;
      const branch = typeof raw?.head_branch === "string" ? raw.head_branch : null;
      if (!branch) throw new NotFound(`${ctx.repo} の実行 ${runId} のブランチが分かりません`);
      if (branch === (await this.defaultBranch(ctx).catch(() => null))) return { worktree_path: null, branch };
      const remotes = await (this.opts.remotes ?? (async (r: string) => (await readGitHubRemotes(r)).remotes))(project.repo_path);
      const target = remotes.find((r) => r.repo.toLowerCase() === ctx.repo.toLowerCase());
      if (!target) throw new Invalid(`連携先（${ctx.repo}）の remote が見つかりません`);
      const headRepo = typeof raw?.head_repository?.full_name === "string" ? raw.head_repository.full_name : ctx.repo;
      const pr = Number(raw?.pull_requests?.[0]?.number ?? 0);
      if (!remotes.some((r) => r.repo.toLowerCase() === headRepo.toLowerCase()) && !pr) throw new Invalid(`ブランチ ${branch} は手元にない fork（${headRepo}）のもので、PR もないので取り出せません`);
      const worktree = await checkoutPullWorktree(project.repo_path, { number: pr, head_ref: branch, head_repo: headRepo }, remotes, target.name, this.github.worktreeCreated(project));
      return { worktree_path: worktree.main ? null : worktree.path, branch: worktree.branch ?? branch };
    });
  }

  /**
   * 失敗の見張り（WorktreePrWatch の 5 分ごと・窓に戻ったときに相乗り）: 作業場所でいま取り出しているブランチと既定のブランチの、
   * ワークフローごとの最新の実行が落ちていて、まだ知らせていないものを覚えて返す（見張らない設定・Git でない・GitHub でなければ空）
   */
  async watch(project: Project, store: Store): Promise<CiFailure[]> {
    if (!project.ci_watch || project.archived_at !== null) return [];
    const workplaces = await this.workplaceBranches(project);
    if (workplaces.length === 0) return [];
    return this.github.within(project, async (ctx) => {
      const defaultBranch = await this.defaultBranch(ctx).catch(() => null);
      const branches = new Set([...workplaces, ...(defaultBranch ? [defaultBranch] : [])]);
      const runs = await this.runsOf(ctx);
      const fresh = failuresToNotify(runs, branches, store.ciNotices.notified(project.id), this.now(), CI_NOTIFY_RECENT_MS);
      for (const run of fresh) store.ciNotices.add(project.id, run.id);
      return fresh.map((r) => ({ project_id: project.id, run_id: r.id, workflow: r.workflow, number: r.number, branch: r.branch ?? "", title: r.title, url: r.url }));
    });
  }
}

/** ログを出せない理由（gh の失敗の文から。純粋な関数） */
export function logUnavailableReason(message: string): string {
  if (/in progress|still running|not completed/i.test(message)) return "実行中のため、ログは終わってから見られます";
  if (/expired|gone|HTTP 410|not found|HTTP 404/i.test(message)) return "GitHub にログが残っていません（保存の期間を過ぎたか、消されました）";
  return message;
}
