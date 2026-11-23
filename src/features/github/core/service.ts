// GitHub タブ（読む・書く）: プロジェクトの連携先のリポジトリの issue・PR の一覧と中身を、プロジェクトのアカウントで GitHub に聞く。
// 中身は DB に持たない（正しいのはいつも GitHub）。一覧は少しの間メモリに覚え、変わっていなければ（ETag で 304 = 使用量に数えない）覚えたものを返す。
// issue・PR の中身も最後に取ったものを少しの間覚え、開き直したときのつなぎに出す（開いたときは必ず GitHub に聞き直す）
import type { GitHubPullWorktree } from "@shared/foundation/apiTypes";
import type { GitHubRemote, GitWorktree } from "@shared/git/types";
import type { GitHubCheckoutPlace, GitHubConnection, GitHubIssueDetail, GitHubItem, GitHubItemPage, GitHubKind, GitHubListFilter, GitHubPullDetail, GitHubPullFiles, GitHubRepoMeta, GitHubUser } from "@shared/github/types";
import type { Project } from "@shared/projects/types";
import { githubSearchQuery } from "@shared/github/searchQuery";
import { isFileOfRepo, repoFileOfUrl } from "@shared/github/repoImage";
import { imageFileType, isIcnsFile } from "@shared/files/imageFiles";
import { errorMessage } from "@shared/foundation/errors";
import { Invalid, NotFound } from "@/foundation/core/errors";
import type { RemoteGit } from "@/foundation/core/workplace/kit";
import { runAsGitHubAccount } from "./account";
import { readGitHubRemotes, resolveGitHubTarget, type GitHubTarget } from "./target";
import { isGitWorkTree } from "@/foundation/core/workplace/reads";
import { checkoutPullMain, checkoutPullWorktree } from "./pullWorktree";
import { ttlCache } from "@/foundation/core/system/ttlCache";
import { ghApi, type GitHubApi, type GitHubContext } from "./ghApi";
import { DETAIL_QUERY, META_QUERY, SEARCH_QUERY, TIMELINE_MAX_PAGES, TIMELINE_MORE_QUERY, VIEWER_QUERY } from "./queries";
import { approvalCount, connectionNodes, nextCursor, toCheck, toItem, toLinkedPulls, toMergeAbility, toMergeState, toPullFile, toThreads, toTimeline, toUser, toViewer } from "./normalize";

/** 一覧の 1 回の件数 */
const GITHUB_PAGE_SIZE = 50;
/** 覚えた一覧を、変わっていなくても聞き直すまでの間（CI の結果は「変わった」に入らないので、5 分で取り直す） */
const LIST_KEEP_MS = 5 * 60_000;
/** 中身を覚えておく間と数（開き直したときのつなぎの表示だけに使う） */
const DETAIL_KEEP_MS = 10 * 60_000;
const DETAIL_KEEP_MAX = 50;
/** 本文の画像（リポジトリの中のファイル）の大きさの上限 */
const GITHUB_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** PR の変更したファイルを読む上限（100 件ずつ 30 回 = GitHub の 3,000 件） */
const FILE_PAGES = 30;

interface CachedPage {
  page: GitHubItemPage;
  /** そのとき聞いた「リポジトリの issue・PR の最新」の ETag */
  etag: string | null;
}

interface GitHubServiceOptions {
  /** 連携先（テストでは差し替える） */
  resolveTarget?: (repo: string, chosen: string | null) => Promise<GitHubTarget | null>;
  /** GitHub に聞く口（repo = 連携先・host = そのホスト。テストでは差し替える） */
  api?: (repo: string, host: string) => GitHubApi;
  /** GitHub の remote の一覧（テストでは差し替える） */
  remotes?: (repo: string) => Promise<GitHubRemote[]>;
  /** PR のブランチのワークツリーを作る（worktrees の WorktreesApi.create。新しく作ったら実行環境も整える） */
  createWorktree: (project: Project, branch: string) => Promise<{ worktree: GitWorktree | undefined }>;
  now?: () => number;
}

export class GitHubService {
  /** 時計（テストは opts.now を差し替える） */
  private readonly clock = { now: () => this.now() };
  /** 覚える一覧（新しい 100 件まで。5 分たてば変わっていなくても聞き直す） */
  private readonly lists = ttlCache<string, CachedPage>({ ms: LIST_KEEP_MS, max: 100, clock: this.clock });
  private readonly metas = ttlCache<string, GitHubRepoMeta>({ ms: 5 * 60_000 });
  /** 最後に取った中身（キーはプロジェクト・アカウント・選んだ remote・種類・番号） */
  private readonly details = ttlCache<string, GitHubIssueDetail | GitHubPullDetail>({ ms: DETAIL_KEEP_MS, max: DETAIL_KEEP_MAX, clock: this.clock });

  /** remoteGit は PR のブランチを取ってくる git（Kernel.workplace.git。CI のタブの「（ブランチ名）で直す」も使う） */
  constructor(private readonly opts: GitHubServiceOptions, readonly remoteGit: RemoteGit) {}

  /** プロジェクトのワークツリーを作る口（CI のタブの「（ブランチ名）で直す」も同じ） */
  worktreeCreator(project: Project): (branch: string) => Promise<GitWorktree | undefined> {
    return async (branch) => (await this.opts.createWorktree(project, branch)).worktree;
  }

  private now() {
    return (this.opts.now ?? Date.now)();
  }

  /** プロジェクトのアカウントの中で fn を動かす（連携先がなければ 400。CI の結果 ci.ts も使う） */
  async within<T>(project: Project, fn: (ctx: GitHubContext) => Promise<T>): Promise<T> {
    return runAsGitHubAccount(project.github_account, async () => {
      const target = await (this.opts.resolveTarget ?? resolveGitHubTarget)(project.repo_path, project.github_remote);
      if (!target) throw new Invalid(NO_REMOTE);
      const [owner, name] = target.repo.split("/");
      const api = (this.opts.api ?? ghApi)(target.repo, target.host);
      return fn({ host: target.host, repo: target.repo, owner, name, api, key: `${project.id}:${target.host}/${target.repo}:${project.github_account ?? ""}` });
    });
  }

  /** 連携の状態（GitHub タブの頭。使えなくても失敗にせず、理由と直し方を返す） */
  async connection(project: Project): Promise<GitHubConnection> {
    // 連携先は git の remote から決める（gh を呼ばないのでアカウントで包まない。聞くのは within の中）
    const target = await (this.opts.resolveTarget ?? resolveGitHubTarget)(project.repo_path, project.github_remote).catch(() => null);
    if (!target) return { host: null, repo: null, account: project.github_account, reason: NO_REMOTE };
    try {
      const login = await this.within(project, async ({ api }) => (await api.graphql<{ viewer: { login: string } }>(VIEWER_QUERY, {})).viewer.login);
      return { host: target.host, repo: target.repo, account: login, reason: null };
    } catch (e) {
      return { host: target.host, repo: target.repo, account: project.github_account, reason: errorMessage(e) };
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
   * 変わっていない・5 分以内なら覚えたものを返す（CI の結果は ETag を変えないので、5 分たてば聞き直す）。refresh なら必ず聞き直す
   */
  list(project: Project, filter: GitHubListFilter, opts: { cursor?: string | null; refresh?: boolean } = {}): Promise<GitHubItemPage> {
    return this.within(project, async (ctx) => {
      const q = githubSearchQuery(ctx.repo, filter);
      if (opts.cursor) return this.search(ctx, q, opts.cursor);
      const cacheKey = `${ctx.key}:${q}`;
      const cached = this.lists.get(cacheKey);
      const probePath = `repos/${ctx.repo}/issues?state=all&sort=updated&direction=desc&per_page=1`;
      if (cached && !opts.refresh && cached.etag) {
        const probe = await ctx.api.rest(probePath, { etag: cached.etag });
        if (probe.status === 304) return { ...cached.page, fetched_at: this.fetchedAt() };
      }
      const [page, probe] = await Promise.all([this.search(ctx, q, null), ctx.api.rest(probePath).catch(() => null)]);
      this.lists.set(cacheKey, { page, etag: probe?.etag ?? null });
      return page;
    });
  }

  private async search(ctx: GitHubContext, q: string, after: string | null): Promise<GitHubItemPage> {
    const data = await ctx.api.graphql<{ search: { issueCount: number; pageInfo: unknown; nodes: unknown[] } }>(SEARCH_QUERY, { q, first: GITHUB_PAGE_SIZE, after });
    return {
      items: (data.search.nodes ?? []).map(toItem).filter((i): i is GitHubItem => i !== null),
      total: data.search.issueCount ?? 0,
      cursor: nextCursor(data.search),
      fetched_at: this.fetchedAt(),
    };
  }

  /** 取った時刻（応答の fetched_at） */
  private fetchedAt(): string {
    return new Date(this.now()).toISOString();
  }

  /** issue か PR の中身（種類が違えば 404。出来事は 300 件まで） */
  issue(project: Project, number: number): Promise<GitHubIssueDetail> {
    return this.detail(project, number, "issue");
  }

  pull(project: Project, number: number): Promise<GitHubPullDetail> {
    return this.detail(project, number, "pr") as Promise<GitHubPullDetail>;
  }

  /**
   * 最後に取った中身（10 分まで。なければ null）。GitHub には聞かないので、画面は開いたときにこれを先に出し、
   * 同時に頼んだ中身（issue / pull）が届いたら差し替える
   */
  cachedDetail(project: Project, kind: GitHubKind, number: number): GitHubIssueDetail | GitHubPullDetail | null {
    return this.details.get(detailKey(project, kind, number)) ?? null;
  }

  private detail(project: Project, number: number, kind: "issue" | "pr"): Promise<GitHubIssueDetail | GitHubPullDetail> {
    return this.fetchDetail(project, number, kind).then((detail) => {
      this.details.set(detailKey(project, kind, number), detail);
      return detail;
    });
  }

  private fetchDetail(project: Project, number: number, kind: "issue" | "pr"): Promise<GitHubIssueDetail | GitHubPullDetail> {
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
      const base = { item, body_html: String(raw.bodyHTML ?? ""), body_markdown: String(raw.body ?? ""), timeline_truncated: cursor !== null, linked_pulls: kind === "issue" ? toLinkedPulls(raw.closedByPullRequestsReferences) : [], viewer: toViewer(raw), fetched_at: this.fetchedAt() };
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
        approvals: approvalCount(raw.latestOpinionatedReviews),
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
   * PR のチェックアウト: worktree はワークツリー（pullWorktree と同じ）、main は本体のブランチを PR のブランチに切り替える
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
      if (place === "main") return { worktree_path: null, branch: await checkoutPullMain(project.repo_path, pr, remotes, target.name, this.remoteGit) };
      const worktree = await checkoutPullWorktree(project.repo_path, pr, remotes, target.name, this.remoteGit, this.worktreeCreator(project));
      return { worktree_path: worktree.main ? null : worktree.path, branch: worktree.branch ?? head.ref };
    });
  }

  /** 書き込み（中身は writes.ts。ルートが渡す）。書いたら、このプロジェクトの覚えた一覧を捨てる */
  write<T>(project: Project, fn: (ctx: GitHubContext) => Promise<T>): Promise<T> {
    return this.within(project, fn).finally(() => {
      this.lists.deleteWhere((key) => key.startsWith(`${project.id}:`));
    });
  }

  /**
   * 本文の画像のうち、連携先のリポジトリの中のファイルを指すもの（非公開のリポジトリは鍵がないと読めないので、プロジェクトのアカウントの gh api で取る。
   * 鍵は画面に渡さない）。1MB までは contents の答えの base64、それより大きければ blob で読む。ほかのリポジトリ・画像でない・大きすぎるものは 400
   */
  repoImage(project: Project, url: string): Promise<{ bytes: Buffer; type: string }> {
    return this.within(project, async ({ api, host, repo }) => {
      const file = repoFileOfUrl(url, host);
      if (!file || !isFileOfRepo(file, repo)) throw new Invalid(`連携先のリポジトリ（${repo}）のファイルの画像だけを読めます`);
      const type = isIcnsFile(file.path) ? null : imageFileType(file.path);
      if (!type) throw new Invalid("画像のファイルではありません");
      const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
      const meta = (await api.rest(`repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(file.ref)}`)).body as {
        type?: unknown;
        size?: unknown;
        sha?: unknown;
        content?: unknown;
        encoding?: unknown;
      } | null;
      if (meta?.type !== "file" || typeof meta.sha !== "string") throw new NotFound("画像のファイルが見つかりません");
      if (Number(meta.size ?? 0) > GITHUB_IMAGE_MAX_BYTES) throw new Invalid("画像が大きすぎます（10MB まで）");
      let content = meta.encoding === "base64" && typeof meta.content === "string" ? meta.content : "";
      if (!content) {
        const blob = (await api.rest(`repos/${repo}/git/blobs/${meta.sha}`)).body as { content?: unknown } | null;
        content = typeof blob?.content === "string" ? blob.content : "";
      }
      return { bytes: Buffer.from(content, "base64"), type };
    });
  }

  /** PR の変更したファイルと差分（REST。100 件ずつ、3,000 件まで） */
  pullFiles(project: Project, number: number): Promise<GitHubPullFiles> {
    return this.within(project, async ({ api, repo }) => {
      const { items, truncated } = await api.restPages(`repos/${repo}/pulls/${number}/files`, FILE_PAGES);
      return { files: items.map(toPullFile), truncated, fetched_at: this.fetchedAt() };
    });
  }
}

/** 覚えた中身のキー（連携先を聞かずに引けるよう、プロジェクトの選択から作る。アカウント・remote を変えたら別のもの） */
const detailKey = (project: Project, kind: GitHubKind, number: number) => `${project.id}:${project.github_account ?? ""}:${project.github_remote ?? ""}:${kind}:${number}`;

const NO_REMOTE = "このプロジェクトフォルダの git に GitHub の remote がありません。GitHub のリポジトリを remote に足すと、issue・PR を見られます";
