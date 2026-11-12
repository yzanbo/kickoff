// PR のレビューの書きかけ（ためた行のコメントと本文）の形と読み直し（画面の保存。lib/storageKeys の githubReviewDraft）
import type { GitHubReviewDraftComment } from "@shared/types";

export interface GitHubReviewDraft {
  body: string;
  comments: GitHubReviewDraftComment[];
}

export const EMPTY_REVIEW_DRAFT: GitHubReviewDraft = { body: "", comments: [] };

const isComment = (c: unknown): c is GitHubReviewDraftComment => {
  const v = c as Partial<GitHubReviewDraftComment> | null;
  return (
    !!v &&
    typeof v.path === "string" &&
    typeof v.line === "number" &&
    (v.side === "LEFT" || v.side === "RIGHT") &&
    (v.start_line === null || typeof v.start_line === "number") &&
    typeof v.body === "string"
  );
};

/** 保存したものを読み直す（形の合わない行のコメントは捨てる） */
export function parseReviewDraft(value: unknown): GitHubReviewDraft | undefined {
  const v = value as { body?: unknown; comments?: unknown } | null;
  if (!v || typeof v !== "object") return undefined;
  return { body: typeof v.body === "string" ? v.body : "", comments: Array.isArray(v.comments) ? v.comments.filter(isComment) : [] };
}

/** 空（本文も行のコメントもない）なら保存しない */
export const isEmptyReviewDraft = (d: GitHubReviewDraft) => !d.body.trim() && d.comments.length === 0;
