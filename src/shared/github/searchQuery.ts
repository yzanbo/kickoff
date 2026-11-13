// GitHub タブの一覧の絞り込みと、GitHub の検索の書き方（search の q）の行き来。コアが GitHub に聞くときと、画面の検索の欄で同じものを使う。
// 担当・マイルストーンの複数は「どれか」（(assignee:a OR assignee:b)。GitHub の新しい検索 ISSUE_ADVANCED の書き方）、ラベルの複数は「すべて」
import { GITHUB_SORTS, type GitHubKind, type GitHubListFilter, type GitHubMineFilter, type GitHubSort, type GitHubStateFilter } from "../types/github";

/** 既定の絞り込み（開いているもの・更新が新しい順） */
export function defaultGitHubFilter(kind: GitHubKind): GitHubListFilter {
  return { kind, state: "open", mine: null, labels: [], assignees: [], milestones: [], text: "", sort: "updated" };
}

/** 種類ごとに出す「自分」の絞り込み（issue にレビュー依頼はない） */
export function mineFiltersFor(kind: GitHubKind): GitHubMineFilter[] {
  return kind === "issue" ? ["assigned", "created", "mentioned"] : ["created", "review_requested", "assigned", "mentioned"];
}

const MINE_QUALIFIERS: Record<GitHubMineFilter, string> = {
  assigned: "assignee:@me",
  created: "author:@me",
  review_requested: "review-requested:@me",
  mentioned: "mentions:@me",
};

/** 検索の値（空白・記号を含めば "…" で囲む。中の " は除く） */
export function searchValue(value: string): string {
  const v = value.replaceAll('"', "").trim();
  return /^[\w.@/-]+$/.test(v) ? v : `"${v}"`;
}

/** 1 つなら key:値、2 つ以上なら (key:a OR key:b) */
const anyOf = (key: string, values: string[]) => {
  const parts = values.map((v) => `${key}:${searchValue(v)}`);
  return parts.length > 1 ? `(${parts.join(" OR ")})` : parts[0];
};

/** 状態・自分・ラベル・担当・マイルストーンの検索の語（PR の「閉じた」はマージしていないものだけ。マージ済みは別に選ぶ） */
function qualifiers(f: GitHubListFilter): string[] {
  const parts: string[] = [];
  if (f.state === "open") parts.push("is:open");
  else if (f.state === "closed") parts.push(f.kind === "pr" ? "is:closed is:unmerged" : "is:closed");
  else if (f.state === "merged" && f.kind === "pr") parts.push("is:merged");
  if (f.mine && mineFiltersFor(f.kind).includes(f.mine)) parts.push(MINE_QUALIFIERS[f.mine]);
  for (const label of f.labels) parts.push(`label:${searchValue(label)}`);
  if (f.assignees.length) parts.push(anyOf("assignee", f.assignees));
  if (f.milestones.length) parts.push(anyOf("milestone", f.milestones));
  return parts;
}

/** 絞り込み → GitHub に聞く検索の文（repo は「持ち主/名前」） */
export function githubSearchQuery(repo: string, f: GitHubListFilter): string {
  return [`repo:${repo}`, f.kind === "issue" ? "is:issue" : "is:pr", ...qualifiers(f), `sort:${f.sort}-desc`, f.text.trim()].filter(Boolean).join(" ");
}

/** 絞り込み → 検索の欄に出す文（リポジトリ・種類は出さず、並べ方は既定から変えたときだけ。札を変えると欄の文も変わる） */
export function githubSearchText(f: GitHubListFilter): string {
  return [...qualifiers(f), f.sort === "updated" ? "" : `sort:${f.sort}-desc`, f.text.trim()].filter(Boolean).join(" ");
}

/** 空白で分ける（"…" と (…) の中は分けない） */
function tokenize(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  let depth = 0;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "(") depth++;
    else if (!quoted && ch === ")") depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && !quoted && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** key:値（値の "…" は外す）。違えば null */
function qualifier(token: string): { key: string; value: string } | null {
  const m = /^([a-z-]+):(.+)$/.exec(token);
  if (!m) return null;
  const raw = m[2];
  const value = (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw).trim();
  return value ? { key: m[1], value } : null;
}

/** key:値 か (key:a OR key:b …) の値（key が違う・形が違う・@me なら null） */
function anyOfValues(token: string, key: string): string[] | null {
  const group = token.startsWith("(") && token.endsWith(")");
  const parts = group ? tokenize(token.slice(1, -1)) : [token];
  if (parts.length % 2 === 0) return null;
  const values: string[] = [];
  for (const [i, part] of parts.entries()) {
    if (i % 2 === 1) {
      if (part !== "OR") return null;
      continue;
    }
    const q = qualifier(part);
    if (!q || q.key !== key || q.value === "@me") return null;
    values.push(q.value);
  }
  return values;
}

const STATE_TOKENS: Record<string, GitHubStateFilter> = { "is:open": "open", "is:closed": "closed", "is:merged": "merged" };
const MINE_OF_TOKEN = Object.fromEntries(Object.entries(MINE_QUALIFIERS).map(([m, q]) => [q, m])) as Record<string, GitHubMineFilter>;

/**
 * 検索の欄の文 → 絞り込み（種類はそのまま）。状態・自分・ラベル・担当・マイルストーン・並べ方の語は札に、残りは検索の文に。
 * 状態の語がなければ「すべて」、並べ方がなければ既定。担当・マイルストーンは初めの 1 つ（か OR のまとまり）だけを札にする
 * （2 つ目は「すべて」の意味になり、札の「どれか」と変わるため、文のまま残す）
 */
export function parseGitHubSearchText(kind: GitHubKind, text: string): GitHubListFilter {
  const f: GitHubListFilter = { ...defaultGitHubFilter(kind), state: "all" };
  const rest: string[] = [];
  let stateSet = false;
  let sortSet = false;
  for (const token of tokenize(text)) {
    const state = STATE_TOKENS[token];
    if (state && !stateSet && (state !== "merged" || kind === "pr")) {
      f.state = state;
      stateSet = true;
      continue;
    }
    // PR の「閉じた」に付く語（「閉じた」なら付け直す）
    if (token === "is:unmerged" && kind === "pr" && f.state === "closed") continue;
    const mine = MINE_OF_TOKEN[token];
    if (mine && !f.mine && mineFiltersFor(kind).includes(mine)) {
      f.mine = mine;
      continue;
    }
    const q = qualifier(token);
    if (q?.key === "label") {
      f.labels.push(q.value);
      continue;
    }
    const assignees = f.assignees.length ? null : anyOfValues(token, "assignee");
    if (assignees) {
      f.assignees = assignees;
      continue;
    }
    const milestones = f.milestones.length ? null : anyOfValues(token, "milestone");
    if (milestones) {
      f.milestones = milestones;
      continue;
    }
    const sort = /^sort:([a-z]+)-desc$/.exec(token)?.[1];
    if (sort && !sortSet && (GITHUB_SORTS as readonly string[]).includes(sort)) {
      f.sort = sort as GitHubSort;
      sortSet = true;
      continue;
    }
    rest.push(token);
  }
  f.text = rest.join(" ");
  return f;
}
