// GitHub タブの一覧の絞り込み（issue と PR で別々に覚え、いま見ている種類も覚える。保存は storageKeys の githubFilters）。
// 形の確かめを純粋関数で持つ（React に依らない）
import {
  GITHUB_KINDS,
  GITHUB_MINE_FILTERS,
  GITHUB_SORTS,
  GITHUB_STATE_FILTERS,
  type GitHubKind,
  type GitHubListFilter,
} from "@shared/types";
import { defaultGitHubFilter } from "@shared/github/searchQuery";

/** プロジェクトごとに覚える絞り込み */
export interface GitHubFilters {
  kind: GitHubKind;
  issue: GitHubListFilter;
  pr: GitHubListFilter;
}

export const DEFAULT_GITHUB_FILTERS: GitHubFilters = { kind: "issue", issue: defaultGitHubFilter("issue"), pr: defaultGitHubFilter("pr") };

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
/** 文字の並び（前の形の 1 つだけの値 assignee・milestone も読む） */
const textList = (list: unknown, single: unknown) =>
  (Array.isArray(list) ? list : typeof single === "string" ? [single] : [])
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim().slice(0, 300))
    .slice(0, 20);

/** 保存した 1 つの種類の絞り込みを確かめる（壊れた項目は既定に戻す） */
function parseFilter(kind: GitHubKind, raw: unknown): GitHubListFilter {
  const base = defaultGitHubFilter(kind);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  return {
    kind,
    state: oneOf(GITHUB_STATE_FILTERS, r.state, base.state),
    mine: r.mine === null ? null : GITHUB_MINE_FILTERS.includes(r.mine as never) ? (r.mine as GitHubListFilter["mine"]) : null,
    labels: Array.isArray(r.labels) ? r.labels.filter((l): l is string => typeof l === "string" && l !== "").slice(0, 20) : [],
    assignees: textList(r.assignees, r.assignee),
    milestones: textList(r.milestones, r.milestone),
    text: typeof r.text === "string" ? r.text.slice(0, 500) : "",
    sort: oneOf(GITHUB_SORTS, r.sort, base.sort),
  };
}

/** 保存した絞り込みを確かめる（形が違えば undefined = 既定） */
export function parseGitHubFilters(raw: unknown): GitHubFilters | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  return { kind: oneOf(GITHUB_KINDS, r.kind, "issue"), issue: parseFilter("issue", r.issue), pr: parseFilter("pr", r.pr) };
}

/** 既定から変えている絞り込みの数（「自分」・状態・ラベル・担当・マイルストーン・検索の文。並べ方は数えない） */
export function activeFilterCount(f: GitHubListFilter): number {
  return [f.state !== "open", f.mine !== null, f.labels.length > 0, f.assignees.length > 0, f.milestones.length > 0, f.text.trim() !== ""].filter(Boolean).length;
}
