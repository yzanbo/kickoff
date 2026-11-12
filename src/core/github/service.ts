// GitHub タブ（要件 5.11 の段階 1「読む」・段階 3「書く」）: プロジェクトの連携先のリポジトリの issue・PR の一覧と中身を、プロジェクトのアカウントで GitHub に聞く。
// 中身は DB に持たない（正しいのはいつも GitHub）。一覧だけ少しの間メモリに覚え、変わっていなければ（ETag で 304 = 使用量に数えない）覚えたものを返す
import type {
  GitHubCheckoutPlace,
  GitHubConnection,
  GitHubCreatedIssue,
  GitHubIssueDetail,
  GitHubItem,
  GitHubItemPage,
  GitHubKind,
  GitHubLabel,
  GitHubLabelsBody,
  GitHubListFilter,
  GitHubMergeBody,
  GitHubMergeResult,
  GitHubNewIssueBody,
  GitHubPullDetail,
  GitHubPullFiles,
  GitHubPullWorktree,
  GitHubRemote,
  GitHubRepoMeta,
  GitHubReviewBody,
  GitHubStateBody,
  GitHubThreadResolveBody,
  GitHubUser,
  Project,
} from "@shared/types";
import { githubSearchQuery } from "@shared/github/searchQuery";
import { errorMessage } from "@shared/errors";
import { Invalid, NotFound } from "../http/errors.js";
import { runAsGitHubAccount } from "../git/githubAccount.js";
import { readGitHubRemotes, resolveGitHubTarget, type GitHubTarget } from "../git/githubTarget.js";
import { isGitWorkTree } from "../git/status.js";
import { checkoutPullMain, checkoutPullWorktree } from "../git/pullWorktree.js";
import { ttlCache } from "../system/ttlCache.js";
import { ghApi, type GitHubApi, type GitHubContext } from "./ghApi.js";
import { DETAIL_QUERY, META_QUERY, SEARCH_QUERY, TIMELINE_MAX_PAGES, TIMELINE_MORE_QUERY, VIEWER_QUERY } from "./queries.js";
import { createIssue, mergePull, postComment, replaceLabels, replyToThread, resolveThread, setState, submitReview } from "./writes.js";
import { connectionNodes, nextCursor, toCheck, toItem, toMergeAbility, toMergeState, toPullFile, toThreads, toTimeline, toUser, toViewer } from "./normalize.js";

/** 一覧の 1 回の件数 */
export const GITHUB_PAGE_SIZE = 50;
/** 覚えた一覧を、変わっていなくても聞き直すまでの間（CI の結果は「変わった」に入らないので、5 分で取り直す） */
const LIST_KEEP_MS = 5 * 60_000;
/** PR の変更したファイルを読む上限（100 件ずつ 30 回 = GitHub の 3,000 件） */
const FILE_PAGES = 30;

interface CachedPage {
  page: GitHubItemPage;
  /** そのとき聞いた「リポジトリの issue・PR の最新」の ETag */
  etag: string | null;
  at: number;
}

interface GitHubServiceOptions {
  /** 連携先（テストでは差し替える） */
  resolveTarget?: (repo: string, chosen: string | null) => Promise<GitHubTarget | null>;
  /** GitHub に聞く口（テストでは差し替える） */
  api?: (repo: string) => GitHubApi;
  /** GitHub の remote の一覧（テストでは差し替える） */
  remotes?: (repo: string) => Promise<GitHubRemote[]>;
  now?: () => number;
}

export class GitHubService {
  private readonly opts: GitHubServiceOptions;
  private readonly lists = new Map<string, CachedPage>();
  private readonly metas = ttlCache<string, GitHubRepoMeta>(5 * 60_000);

  constructor(opts: GitHubServiceOptions = {}) {
    this.opts = opts;
  }

  private now() {
    return (this.opts.now ?? Date.now)();
  }

  /** プロジェクトのアカウントの中で fn を動かす（連携先がなければ 400） */
  private async within<T>(project: Project, fn: (ctx: GitHubContext) => Promise<T>): Promise<T> {
    return runAsGitHubAccount(project.github_account, async () => {
      const target = await (this.opts.resolveTarget ?? resolveGitHubTarget)(project.repo_path, project.github_remote);
      if (!target) throw new Invalid(NO_REMOTE);
      const [owner, name] = target.repo.split("/");
      const api = (this.opts.api ?? ghApi)(target.repo);
      return fn({ repo: target.repo, owner, name, api, key: `${project.id}:${target.repo}:${project.github_account ?? ""}` });
    });
  }

  /** 連携の状態（GitHub タブの頭。使えなくても失敗にせず、理由と直し方を返す） */
  async connection(project: Project): Promise<GitHubConnection> {
    const target = await runAsGitHubAccount(project.github_account, () =>
      (this.opts.resolveTarget ?? resolveGitHubTarget)(project.repo_path, project.github_remote).catch(() => null),
    );
    if (!target) return { repo: null, account: project.github_account, reason: NO_REMOTE };
    try {
      const login = await this.within(project, async ({ api }) => (await api.graphql<{ viewer: { login: string } }>(VIEWER_QUERY, {})).viewer.login);
      return { repo: target.repo, account: login, reason: null };
    } catch (e) {
      return { repo: target.repo, account: project.github_account, reason: errorMessage(e) };
    }
  }

  /** 絞り込みの候補（5 分覚える） */
  meta(project: Project): Promise<GitHubRepoMeta> {
    return this.within(project, async ({ api, repo, owner, name, key }) => {
      const cached = this.metas.get(key);
      if (cached) return cached;
      const data = await api.graphql<{ viewer: { login: string }; repository: unknown }>(META_QUERY, { owner, name });
      const r = data.repository as { labels?: unknown; milestones?: unknown; assignableUsers?: unknown } | null;
      if (!r) throw new NotFound(`連携先のリポジトリ「${repo}」が見つかりません`);
      const meta: GitHubRepoMeta = {
        repo,
        viewer: data.viewer.login,
        labels: connectionNodes(r.labels).map((l) => ({ name: String(l.name), color: String(l.color) })),
        milestones: connectionNodes(r.milestones).map((m) => String(m.title)),
        assignees: connectionNodes(r.assignableUsers)
          .map(toUser)
          .filter((u): u is GitHubUser => u !== null),
      };
      this.metas.set(key, meta);
      return meta;
    });
  }

  /**
   * 一覧（cursor = 続き）。頭の 1 回は、前に取ったときの ETag で「リポジトリの issue・PR が変わったか」を聞き（変わっていなければ使用量に数えない）、
   * 変わっていない・5 分以内なら覚えたものを返す。refresh なら必ず聞き直す
   */
  list(project: Project, filter: GitHubListFilter, opts: { cursor?: string | null; refresh?: boolean } = {}): Promise<GitHubItemPage> {
    return this.within(project, async (ctx) => {
      const q = githubSearchQuery(ctx.repo, filter);
      if (opts.cursor) return this.search(ctx, q, opts.cursor);
      const cacheKey = `${ctx.key}:${q}`;
      const cached = this.lists.get(cacheKey);
      const probePath = `repos/${ctx.repo}/issues?state=all&sort=updated&direction=desc&per_page=1`;
      if (cached && !opts.refresh && this.now() - cached.at < LIST_KEEP_MS && cached.etag) {
        const probe = await ctx.api.rest(probePath, { etag: cached.etag });
        if (probe.status === 304) return { ...cached.page, fetched_at: new Date(this.now()).toISOString() };
      }
      const [page, probe] = await Promise.all([this.search(ctx, q, null), ctx.api.rest(probePath).catch(() => null)]);
      this.lists.set(cacheKey, { page, etag: probe?.etag ?? null, at: this.now() });
      this.trimLists();
      return page;
    });
  }

  private async search(ctx: GitHubContext, q: string, after: string | null): Promise<GitHubItemPage> {
    const data = await ctx.api.graphql<{ search: { issueCount: number; pageInfo: unknown; nodes: unknown[] } }>(SEARCH_QUERY, { q, first: GITHUB_PAGE_SIZE, after });
    return {
      items: (data.search.nodes ?? []).map(toItem).filter((i): i is GitHubItem => i !== null),
      total: data.search.issueCount ?? 0,
      cursor: nextCursor(data.search),
      fetched_at: new Date(this.now()).toISOString(),
    };
  }

  /** 覚える一覧は新しい 100 件まで */
  private trimLists() {
    while (this.lists.size > 100) this.lists.delete(this.lists.keys().next().value as string);
  }

  /** issue か PR の中身（種類が違えば 404。出来事は 300 件まで） */
  issue(project: Project, number: number): Promise<GitHubIssueDetail> {
    return this.detail(project, number, "issue");
  }

  pull(project: Project, number: number): Promise<GitHubPullDetail> {
    return this.detail(project, number, "pr") as Promise<GitHubPullDetail>;
  }

  private detail(project: Project, number: number, kind: "issue" | "pr"): Promise<GitHubIssueDetail | GitHubPullDetail> {
    return this.within(project, async ({ api, repo, owner, name }) => {
      const vars = { owner, name, number, after: null as string | null };
      const data = await api.graphql<{ repository: ({ issueOrPullRequest: Record<string, unknown> | null } & Record<string, unknown>) | null }>(DETAIL_QUERY, vars);
      const raw = data.repository?.issueOrPullRequest;
      const item = raw ? toItem(raw) : null;
      if (!raw || !item) throw new NotFound(`${repo} に #${number} はありません`);
      if (item.kind !== kind) throw new NotFound(`#${number} は${kind === "issue" ? " issue ではなく PR" : " PR ではなく issue"}です`);
      // 出来事は 100 件ずつ、3 回まで続きを読む
      const items = [...connectionNodes(raw.timelineItems)];
      let cursor = nextCursor(raw.timelineItems);
      for (let page = 1; cursor && page < TIMELINE_MAX_PAGES; page++) {
        const more = await api.graphql<{ repository: { issueOrPullRequest: { timelineItems?: unknown } | null } | null }>(TIMELINE_MORE_QUERY, { ...vars, after: cursor });
        const conn = more.repository?.issueOrPullRequest?.timelineItems;
        items.push(...connectionNodes(conn));
        cursor = nextCursor(conn);
      }
      const base = { item, body_html: String(raw.bodyHTML ?? ""), body_markdown: String(raw.body ?? ""), timeline_truncated: cursor !== null, viewer: toViewer(raw), fetched_at: new Date(this.now()).toISOString() };
      if (kind === "issue") return { ...base, timeline: toTimeline(items) };
      const { threads, threadReview } = toThreads(raw.reviewThreads);
      const statusCommit = connectionNodes(raw.statusCommits)[0] as { commit?: { statusCheckRollup?: { contexts?: unknown } } } | undefined;
      const mergeable = String(raw.mergeable ?? "UNKNOWN").toLowerCase();
      return {
        ...base,
        timeline: toTimeline(items, threads, threadReview),
        additions: Number(raw.additions ?? 0),
        deletions: Number(raw.deletions ?? 0),
        changed_files: Number(raw.changedFiles ?? 0),
        head_sha: typeof raw.headRefOid === "string" ? raw.headRefOid : null,
        head_owner: (raw.headRepositoryOwner as { login?: string } | null)?.login ?? null,
        mergeable: mergeable === "mergeable" || mergeable === "conflicting" ? mergeable : "unknown",
        merge_state: toMergeState(raw.mergeStateStatus),
        ...toMergeAbility(data.repository),
        review_threads: threads,
        checks: connectionNodes(statusCommit?.commit?.statusCheckRollup?.contexts)
          .map(toCheck)
          .filter((c): c is NonNullable<typeof c> => c !== null),
      } satisfies GitHubPullDetail;
    });
  }

  /**
   * PR のブランチのワークツリー（レビューコメントで直すチャットの作業場所）。そのブランチを取り出している作業場所があればそれ、
   * なければ PR の元のブランチを取ってきて作る（git/pullWorktree.ts）。Git で管理していないフォルダ・連携先の remote がなければ 400
   */
  pullWorktree(project: Project, number: number): Promise<GitHubPullWorktree> {
    return this.pullCheckout(project, number, "worktree");
  }

  /**
   * PR のチェックアウト（段階 3）: worktree はワークツリー（pullWorktree と同じ）、main は本体のブランチを PR のブランチに切り替える
   * （ほかのワークツリーで取り出しているブランチは 400。fork の PR も取れる）
   */
  pullCheckout(project: Project, number: number, place: GitHubCheckoutPlace): Promise<GitHubPullWorktree> {
    return this.within(project, async ({ api, repo }) => {
      if (!(await isGitWorkTree(project.repo_path))) throw new Invalid("プロジェクトフォルダを Git で管理していないので、PR のブランチを取り出せません");
      const res = await api.rest(`repos/${repo}/pulls/${number}`);
      const head = (res.body as { head?: { ref?: unknown; repo?: { full_name?: unknown } | null } } | null)?.head;
      if (typeof head?.ref !== "string" || !head.ref) throw new NotFound(`${repo} に PR #${number} はありません`);
      const remotes = await (this.opts.remotes ?? (async (r: string) => (await readGitHubRemotes(r)).remotes))(project.repo_path);
      const target = remotes.find((r) => r.repo.toLowerCase() === repo.toLowerCase());
      if (!target) throw new Invalid(`連携先（${repo}）の remote が見つかりません`);
      const pr = { number, head_ref: head.ref, head_repo: typeof head.repo?.full_name === "string" ? head.repo.full_name : null };
      if (place === "main") return { worktree_path: null, branch: await checkoutPullMain(project.repo_path, pr, remotes, target.name) };
      const worktree = await checkoutPullWorktree(project.repo_path, pr, remotes, target.name);
      return { worktree_path: worktree.main ? null : worktree.path, branch: worktree.branch ?? head.ref };
    });
  }

  // ---- 書き込み（段階 3。writes.ts）。書いたら、このプロジェクトの覚えた一覧を捨てる ----

  comment(project: Project, number: number, body: string): Promise<void> {
    return this.write(project, (ctx) => postComment(ctx, number, body));
  }

  setState(project: Project, kind: GitHubKind, number: number, input: GitHubStateBody): Promise<void> {
    return this.write(project, (ctx) => setState(ctx, kind, number, input));
  }

  setLabels(project: Project, number: number, input: GitHubLabelsBody): Promise<GitHubLabel[]> {
    return this.write(project, (ctx) => replaceLabels(ctx, number, input));
  }

  createIssue(project: Project, input: GitHubNewIssueBody): Promise<GitHubCreatedIssue> {
    return this.write(project, (ctx) => createIssue(ctx, input));
  }

  review(project: Project, number: number, input: GitHubReviewBody): Promise<void> {
    return this.write(project, (ctx) => submitReview(ctx, number, input));
  }

  replyToThread(project: Project, threadId: string, body: string): Promise<void> {
    return this.write(project, (ctx) => replyToThread(ctx, threadId, body));
  }

  resolveThread(project: Project, threadId: string, input: GitHubThreadResolveBody): Promise<void> {
    return this.write(project, (ctx) => resolveThread(ctx, threadId, input));
  }

  merge(project: Project, number: number, input: GitHubMergeBody): Promise<GitHubMergeResult> {
    return this.write(project, (ctx) => mergePull(ctx, number, input));
  }

  private write<T>(project: Project, fn: (ctx: GitHubContext) => Promise<T>): Promise<T> {
    return this.within(project, fn).finally(() => {
      for (const key of [...this.lists.keys()]) if (key.startsWith(`${project.id}:`)) this.lists.delete(key);
    });
  }

  /** PR の変更したファイルと差分（REST。100 件ずつ、3,000 件まで） */
  pullFiles(project: Project, number: number): Promise<GitHubPullFiles> {
    return this.within(project, async ({ api, repo }) => {
      const { items, truncated } = await api.restPages(`repos/${repo}/pulls/${number}/files`, FILE_PAGES);
      return { files: items.map(toPullFile), truncated, fetched_at: new Date(this.now()).toISOString() };
    });
  }
}

const NO_REMOTE = "このプロジェクトフォルダの git に GitHub の remote がありません。GitHub のリポジトリを remote に足すと、issue・PR を見られます";
