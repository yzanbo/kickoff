// GitHub の GraphQL・REST の答えを、GitHub タブの API の形（@shared/types の GitHub…）にする（どれも純粋な関数）
import type {
  GitHubCheck,
  GitHubChecksState,
  GitHubItem,
  GitHubItemState,
  GitHubLabel,
  GitHubPullFile,
  GitHubReviewDecision,
  GitHubReviewThread,
  GitHubTimelineEntry,
  GitHubUser,
} from "@shared/types";

/** GitHub の答え（形は 1 つずつ確かめながら読む） */
type Raw = any;

const lower = (v: unknown): string | null => (typeof v === "string" && v ? v.toLowerCase() : null);
const nodes = (conn: Raw): Raw[] => (Array.isArray(conn?.nodes) ? conn.nodes.filter(Boolean) : []);

export function toUser(raw: Raw): GitHubUser | null {
  if (!raw || typeof raw.login !== "string") return null;
  return { login: raw.login, avatar_url: typeof raw.avatarUrl === "string" ? raw.avatarUrl : null };
}

const toLabel = (raw: Raw): GitHubLabel => ({ name: String(raw.name ?? ""), color: String(raw.color ?? "ededed") });

/** CI のまとめの状態（statusCheckRollup.state） */
export function checksStateOf(state: unknown): GitHubChecksState | null {
  switch (state) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
      return "failure";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return null;
  }
}

/** 一覧の 1 件（Issue / PullRequest のどちらでもない・番号のないものは null） */
export function toItem(raw: Raw): GitHubItem | null {
  if (!raw || typeof raw.number !== "number" || (raw.__typename !== "Issue" && raw.__typename !== "PullRequest")) return null;
  const pr = raw.__typename === "PullRequest";
  const reason = lower(raw.stateReason);
  return {
    kind: pr ? "pr" : "issue",
    number: raw.number,
    title: String(raw.title ?? ""),
    state: (lower(raw.state) ?? "open") as GitHubItemState,
    state_reason: reason === "reopened" ? null : reason,
    url: String(raw.url ?? ""),
    author: toUser(raw.author),
    labels: nodes(raw.labels).map(toLabel),
    assignees: nodes(raw.assignees).map(toUser).filter((u): u is GitHubUser => u !== null),
    milestone: typeof raw.milestone?.title === "string" ? raw.milestone.title : null,
    comments: Number(raw.comments?.totalCount ?? 0),
    created_at: String(raw.createdAt ?? ""),
    updated_at: String(raw.updatedAt ?? ""),
    closed_at: typeof raw.closedAt === "string" ? raw.closedAt : null,
    is_draft: pr && raw.isDraft === true,
    review_decision: pr ? (lower(raw.reviewDecision) as GitHubReviewDecision | null) : null,
    checks: pr ? checksStateOf(nodes(raw.commits)[0]?.commit?.statusCheckRollup?.state) : null,
    head_ref: pr && typeof raw.headRefName === "string" ? raw.headRefName : null,
    base_ref: pr && typeof raw.baseRefName === "string" ? raw.baseRefName : null,
  };
}

const CLOSE_TEXT: Record<string, string> = { completed: "完了として閉じました", not_planned: "やらないことにして閉じました", duplicate: "重複として閉じました" };

/** 出来事の文（知らない種類は null で出さない） */
export function eventText(raw: Raw): string | null {
  const who = (u: Raw) => (typeof u?.login === "string" ? u.login : typeof u?.name === "string" ? u.name : "（不明）");
  switch (raw.__typename) {
    case "LabeledEvent":
      return `ラベル「${raw.label?.name ?? ""}」を付けました`;
    case "UnlabeledEvent":
      return `ラベル「${raw.label?.name ?? ""}」を外しました`;
    case "AssignedEvent":
      return `${who(raw.assignee)} を担当にしました`;
    case "UnassignedEvent":
      return `${who(raw.assignee)} を担当から外しました`;
    case "ClosedEvent":
      return CLOSE_TEXT[lower(raw.stateReason) ?? ""] ?? "閉じました";
    case "ReopenedEvent":
      return "開き直しました";
    case "CrossReferencedEvent":
      return typeof raw.source?.number === "number" ? `#${raw.source.number}「${raw.source.title ?? ""}」から参照されました` : "ほかから参照されました";
    case "RenamedTitleEvent":
      return `題名を「${raw.previousTitle ?? ""}」から「${raw.currentTitle ?? ""}」に変えました`;
    case "MilestonedEvent":
      return `マイルストーン「${raw.milestoneTitle ?? ""}」に入れました`;
    case "DemilestonedEvent":
      return `マイルストーン「${raw.milestoneTitle ?? ""}」から外しました`;
    case "MergedEvent":
      return `${raw.commit?.abbreviatedOid ?? ""} を ${raw.mergeRefName ?? ""} にマージしました`.trim();
    case "ReviewRequestedEvent":
      return `${who(raw.requestedReviewer)} にレビューを頼みました`;
    case "HeadRefForcePushedEvent":
      return "ブランチを強制プッシュしました";
    case "ReadyForReviewEvent":
      return "レビューできる状態にしました";
    case "ConvertToDraftEvent":
      return "下書きに戻しました";
    default:
      return null;
  }
}

/** 出来事の並び（コメント・レビュー・続けてのコミットは 1 つにまとめる・ほかは文。threads はレビューに行のスレッドを結ぶため） */
export function toTimeline(items: Raw[], threads: GitHubReviewThread[] = [], threadReview: Map<string, string> = new Map()): GitHubTimelineEntry[] {
  const out: GitHubTimelineEntry[] = [];
  for (const raw of items) {
    if (!raw) continue;
    if (raw.__typename === "IssueComment") {
      out.push({ type: "comment", id: String(raw.id), author: toUser(raw.author), created_at: String(raw.createdAt ?? ""), body_html: String(raw.bodyHTML ?? ""), url: raw.url ?? null });
    } else if (raw.__typename === "PullRequestReview") {
      const id = String(raw.id);
      const threadIds = threads.filter((t) => threadReview.get(t.id) === id).map((t) => t.id);
      const body = String(raw.bodyHTML ?? "");
      // 本文も行のスレッドもない「コメントだけ」のレビューは出さない（返信のたびにできる空のレビュー）
      if (!body.trim() && threadIds.length === 0 && raw.state === "COMMENTED") continue;
      out.push({ type: "review", id, author: toUser(raw.author), created_at: String(raw.createdAt ?? ""), state: lower(raw.state) ?? "commented", body_html: body, thread_ids: threadIds });
    } else if (raw.__typename === "PullRequestCommit") {
      const c = raw.commit ?? {};
      const commit = { oid: String(c.oid ?? ""), message: String(c.messageHeadline ?? "") };
      const last = out[out.length - 1];
      if (last?.type === "commits") last.commits.push(commit);
      else
        out.push({
          type: "commits",
          id: String(raw.id),
          created_at: String(c.committedDate ?? ""),
          author: toUser(c.author?.user) ?? (typeof c.author?.name === "string" ? { login: c.author.name, avatar_url: null } : null),
          commits: [commit],
        });
    } else {
      const text = eventText(raw);
      if (text) out.push({ type: "event", id: String(raw.id), actor: toUser(raw.actor), created_at: String(raw.createdAt ?? ""), text });
    }
  }
  return out;
}

/** 行のスレッドと、スレッドを付けたレビュー（最初のコメントのレビュー）の対応 */
export function toThreads(conn: Raw): { threads: GitHubReviewThread[]; threadReview: Map<string, string> } {
  const threadReview = new Map<string, string>();
  const threads = nodes(conn).map((t): GitHubReviewThread => {
    const comments = nodes(t.comments);
    const review = comments[0]?.pullRequestReview?.id;
    if (typeof review === "string") threadReview.set(String(t.id), review);
    return {
      id: String(t.id),
      path: String(t.path ?? ""),
      line: typeof t.line === "number" ? t.line : null,
      original_line: typeof t.originalLine === "number" ? t.originalLine : null,
      side: t.diffSide === "LEFT" ? "LEFT" : "RIGHT",
      resolved: t.isResolved === true,
      outdated: t.isOutdated === true,
      comments: comments.map((c) => ({
        id: String(c.id),
        author: toUser(c.author),
        created_at: String(c.createdAt ?? ""),
        body_html: String(c.bodyHTML ?? ""),
        diff_hunk: String(c.diffHunk ?? ""),
        url: c.url ?? null,
      })),
    };
  });
  return { threads, threadReview };
}

/** チェック 1 つ（CheckRun = GitHub Actions など / StatusContext = 外の CI の状態） */
export function toCheck(raw: Raw): GitHubCheck | null {
  if (raw?.__typename === "CheckRun") {
    const state = raw.status === "COMPLETED" ? (lower(raw.conclusion) ?? "neutral") : "pending";
    return { name: String(raw.name ?? ""), workflow: raw.checkSuite?.workflowRun?.workflow?.name ?? null, state, description: raw.title ?? null, url: raw.detailsUrl ?? null };
  }
  if (raw?.__typename === "StatusContext") {
    const s = lower(raw.state) ?? "pending";
    return { name: String(raw.context ?? ""), workflow: null, state: s === "error" ? "failure" : s === "expected" ? "pending" : s, description: raw.description ?? null, url: raw.targetUrl ?? null };
  }
  return null;
}

/** REST の PR の変更したファイル 1 つ */
export function toPullFile(raw: Raw): GitHubPullFile {
  return {
    path: String(raw?.filename ?? ""),
    previous_path: typeof raw?.previous_filename === "string" ? raw.previous_filename : null,
    status: String(raw?.status ?? "modified"),
    additions: Number(raw?.additions ?? 0),
    deletions: Number(raw?.deletions ?? 0),
    patch: typeof raw?.patch === "string" ? raw.patch : null,
  };
}

/** 中身の出来事の続きの印（なければ null） */
export const nextCursor = (conn: Raw): string | null => (conn?.pageInfo?.hasNextPage && typeof conn.pageInfo.endCursor === "string" ? conn.pageInfo.endCursor : null);

export { nodes as connectionNodes };
