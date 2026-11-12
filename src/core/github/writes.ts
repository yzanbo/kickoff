// GitHub タブの書き込み（要件 5.11 の段階 3「書く」）: コメント・閉じる / 開き直す・ラベル・issue の作成・PR のレビューの送信・
// 行のスレッドへの返信と解決・マージ。どれもプロジェクトのアカウントで連携先に送る（GitHubService.within の中で呼ぶ）。
// 断られたら GitHub の理由（保護ルール・権限など）を文にして 400（ghApi の send）
import type {
  GitHubCreatedIssue,
  GitHubLabel,
  GitHubLabelsBody,
  GitHubMergeBody,
  GitHubMergeResult,
  GitHubNewIssueBody,
  GitHubReviewBody,
  GitHubStateBody,
  GitHubThreadResolveBody,
} from "@shared/types";
import { Invalid } from "../http/errors.js";
import type { GitHubContext } from "./ghApi.js";
import { RESOLVE_THREAD_MUTATION, THREAD_REPLY_MUTATION, UNRESOLVE_THREAD_MUTATION } from "./queries.js";

/** REST のレビューの送り方 */
const REVIEW_EVENT = { comment: "COMMENT", approve: "APPROVE", request_changes: "REQUEST_CHANGES" } as const;

/** issue・PR にコメントする（PR の会話のコメントも issue の口） */
export async function postComment({ api, repo }: GitHubContext, number: number, body: string): Promise<void> {
  await api.send("POST", `repos/${repo}/issues/${number}/comments`, { body });
}

/** 閉じる / 開き直す（issue は閉じ方も。PR は pulls の口） */
export async function setState({ api, repo }: GitHubContext, kind: "issue" | "pr", number: number, input: GitHubStateBody): Promise<void> {
  if (kind === "pr") {
    await api.send("PATCH", `repos/${repo}/pulls/${number}`, { state: input.state });
    return;
  }
  const reason = input.state === "closed" ? (input.reason ?? "completed") : "reopened";
  await api.send("PATCH", `repos/${repo}/issues/${number}`, { state: input.state, state_reason: reason });
}

/** ラベルを置き換える（付けるものすべてを送る。空なら全部外す）。付いたあとのラベルを返す */
export async function replaceLabels({ api, repo }: GitHubContext, number: number, input: GitHubLabelsBody): Promise<GitHubLabel[]> {
  const res = await api.send("PUT", `repos/${repo}/issues/${number}/labels`, { labels: input.labels });
  return (Array.isArray(res) ? res : []).map((l: { name?: unknown; color?: unknown }) => ({ name: String(l.name ?? ""), color: String(l.color ?? "ededed") }));
}

/** 新しい issue を作る */
export async function createIssue({ api, repo }: GitHubContext, input: GitHubNewIssueBody): Promise<GitHubCreatedIssue> {
  const res = (await api.send("POST", `repos/${repo}/issues`, input)) as { number?: unknown; html_url?: unknown } | null;
  if (typeof res?.number !== "number") throw new Invalid("issue を作れたか分かりませんでした。GitHub で確かめてください");
  return { number: res.number, url: String(res.html_url ?? "") };
}

/** REST のレビューの本文にする（純粋な関数。コメントだけで本文も行のコメントもないものは送れない。変更依頼は本文が要る） */
export function reviewPayload(input: GitHubReviewBody): Record<string, unknown> {
  const body = input.body.trim();
  if (input.event === "comment" && !body && input.comments.length === 0) throw new Invalid("コメントで送るときは、本文か行のコメントを書いてください");
  if (input.event === "request_changes" && !body && input.comments.length === 0) throw new Invalid("変更依頼には、本文か行のコメントで直してほしいことを書いてください");
  return {
    event: REVIEW_EVENT[input.event],
    ...(body ? { body } : {}),
    ...(input.commit_id ? { commit_id: input.commit_id } : {}),
    comments: input.comments.map((c) => ({
      path: c.path,
      line: c.line,
      side: c.side,
      body: c.body,
      ...(c.start_line !== null && c.start_line < c.line ? { start_line: c.start_line, start_side: c.side } : {}),
    })),
  };
}

/** PR のレビューを送る（ためた行のコメントもまとめて 1 回で） */
export async function submitReview({ api, repo }: GitHubContext, number: number, input: GitHubReviewBody): Promise<void> {
  await api.send("POST", `repos/${repo}/pulls/${number}/reviews`, reviewPayload(input));
}

/** 行のスレッドに返信する */
export async function replyToThread({ api }: GitHubContext, threadId: string, body: string): Promise<void> {
  await api.graphql(THREAD_REPLY_MUTATION, { thread: threadId, body });
}

/** 行のスレッドを解決済みにする / 戻す */
export async function resolveThread({ api }: GitHubContext, threadId: string, input: GitHubThreadResolveBody): Promise<void> {
  await api.graphql(input.resolved ? RESOLVE_THREAD_MUTATION : UNRESOLVE_THREAD_MUTATION, { thread: threadId });
}

/** PR をマージする（sha を渡すと、確認のあとに積まれたコミットがあれば GitHub が断る） */
export async function mergePull({ api, repo }: GitHubContext, number: number, input: GitHubMergeBody): Promise<GitHubMergeResult> {
  const res = (await api.send("PUT", `repos/${repo}/pulls/${number}/merge`, { merge_method: input.method, ...(input.sha ? { sha: input.sha } : {}) })) as {
    merged?: unknown;
    sha?: unknown;
    message?: unknown;
  } | null;
  if (res?.merged === false) throw new Invalid(`マージできませんでした${typeof res.message === "string" ? `: ${res.message}` : ""}`);
  return { sha: typeof res?.sha === "string" ? res.sha : null };
}
