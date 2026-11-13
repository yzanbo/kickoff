// GitHub タブ（プロジェクトの連携先のリポジトリの issue・PR を読む）の形。中身は DB に持たず、開くたびに GitHub に聞く

/** 一覧の種類（issue と PR は切り替えて別々の一覧にする） */
export const GITHUB_KINDS = ["issue", "pr"] as const;
export type GitHubKind = (typeof GITHUB_KINDS)[number];
export const GITHUB_KIND_LABELS: Record<GitHubKind, string> = { issue: "issue", pr: "PR" };

/** 一覧の状態の絞り込み（merged は PR だけ） */
export const GITHUB_STATE_FILTERS = ["open", "closed", "merged", "all"] as const;
export type GitHubStateFilter = (typeof GITHUB_STATE_FILTERS)[number];
export const GITHUB_STATE_FILTER_LABELS: Record<GitHubStateFilter, string> = { open: "開いている", closed: "閉じた", merged: "マージ済み", all: "すべて" };

/** 「自分」の素早い絞り込み（issue は担当・作成・メンション、PR は作成・レビュー依頼・担当・メンション） */
export const GITHUB_MINE_FILTERS = ["assigned", "created", "review_requested", "mentioned"] as const;
export type GitHubMineFilter = (typeof GITHUB_MINE_FILTERS)[number];
export const GITHUB_MINE_FILTER_LABELS: Record<GitHubMineFilter, string> = {
  assigned: "自分が担当",
  created: "自分が作成",
  review_requested: "レビューを頼まれた",
  mentioned: "自分へのメンション",
};

/** 並べ方 */
export const GITHUB_SORTS = ["updated", "created", "comments"] as const;
export type GitHubSort = (typeof GITHUB_SORTS)[number];
export const GITHUB_SORT_LABELS: Record<GitHubSort, string> = { updated: "更新が新しい順", created: "作成が新しい順", comments: "コメントが多い順" };

/** 一覧の絞り込み（既定は開いているもの・更新が新しい順） */
export interface GitHubListFilter {
  kind: GitHubKind;
  state: GitHubStateFilter;
  mine: GitHubMineFilter | null;
  labels: string[];
  /** 担当のログイン名 */
  assignee: string | null;
  /** マイルストーンの名前 */
  milestone: string | null;
  /** 検索の文字（GitHub の検索の書き方も使える: is:draft・author:… など） */
  text: string;
  sort: GitHubSort;
}

/** GitHub のユーザー（消えたユーザーは ghost） */
export interface GitHubUser {
  login: string;
  avatar_url: string | null;
}

export interface GitHubLabel {
  name: string;
  /** 6 桁の 16 進（# なし） */
  color: string;
}

/** issue・PR の状態（merged は PR だけ） */
export type GitHubItemState = "open" | "closed" | "merged";

/** CI の成否（チェックがなければ null） */
export type GitHubChecksState = "success" | "failure" | "pending";

/** PR のレビューの決まり（必要なレビューがない・設定していなければ null） */
export type GitHubReviewDecision = "approved" | "changes_requested" | "review_required";

/** 一覧の 1 件 */
export interface GitHubItem {
  kind: GitHubKind;
  number: number;
  title: string;
  state: GitHubItemState;
  /** issue の閉じ方（completed = 完了・not_planned = やらない・duplicate = 重複） */
  state_reason: string | null;
  url: string;
  author: GitHubUser | null;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  milestone: string | null;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  /** PR だけ（issue は false・null） */
  is_draft: boolean;
  review_decision: GitHubReviewDecision | null;
  checks: GitHubChecksState | null;
  head_ref: string | null;
  base_ref: string | null;
}

/** 一覧の 1 回分（cursor は続きを読む印。なければ終わり） */
export interface GitHubItemPage {
  items: GitHubItem[];
  total: number;
  cursor: string | null;
  /** 取った時刻（ISO） */
  fetched_at: string;
}

/** 連携の状態（GitHub タブの頭。使えなければ reason に直し方） */
export interface GitHubConnection {
  /** 連携先のホスト（github.com など。GitHub の remote がなければ null） */
  host: string | null;
  /** 連携先のリポジトリ（「持ち主/名前」。GitHub の remote がなければ null） */
  repo: string | null;
  /** 使うアカウント（gh でいま有効なもの・プロジェクトで選んだもの。わからなければ null） */
  account: string | null;
  /** 使えないときの理由と直し方（使えれば null） */
  reason: string | null;
}

/** 絞り込みの候補（ラベル・マイルストーン・担当にできる人） */
export interface GitHubRepoMeta {
  repo: string;
  viewer: string;
  labels: GitHubLabel[];
  milestones: string[];
  assignees: GitHubUser[];
}

/** issue・PR の出来事（会話の流れの 1 つ） */
export type GitHubTimelineEntry =
  | { type: "comment"; id: string; author: GitHubUser | null; created_at: string; body_html: string; body_markdown: string; url: string | null }
  | {
      type: "review";
      id: string;
      author: GitHubUser | null;
      created_at: string;
      /** approved / changes_requested / commented / dismissed */
      state: string;
      body_html: string;
      body_markdown: string;
      /** このレビューで付けた行のスレッドの ID（中身は PR の review_threads） */
      thread_ids: string[];
    }
  | { type: "commits"; id: string; created_at: string; author: GitHubUser | null; commits: { oid: string; message: string }[] }
  | { type: "event"; id: string; actor: GitHubUser | null; created_at: string; text: string };

/** PR の行のスレッド（差分の中に出す） */
export interface GitHubReviewThread {
  id: string;
  path: string;
  /** 新しい側の行（消した行へのスレッドは古い側の行 original_line で） */
  line: number | null;
  original_line: number | null;
  /** LEFT = 古い側・RIGHT = 新しい側 */
  side: "LEFT" | "RIGHT";
  resolved: boolean;
  outdated: boolean;
  /** 自分が返信できる */
  can_reply: boolean;
  /** 自分が解決済みにできる（解決済みなら、戻せる） */
  can_resolve: boolean;
  comments: { id: string; author: GitHubUser | null; created_at: string; body_html: string; /** 書いたままの Markdown（AI に渡す文に使う） */ body_markdown: string; diff_hunk: string; url: string | null }[];
}

/** PR のチェック 1 つ */
export interface GitHubCheck {
  name: string;
  /** ワークフローの名前（GitHub Actions のとき） */
  workflow: string | null;
  /** success / failure / pending / skipped / neutral / cancelled など */
  state: string;
  description: string | null;
  url: string | null;
  /** GitHub Actions の実行とジョブの ID（Kickoff の中でログを開く。外の CI は null） */
  run_id: number | null;
  job_id: number | null;
}

/** issue の中身 */
export interface GitHubIssueDetail {
  item: GitHubItem;
  body_html: string;
  /** 本文の書いたままの Markdown（AI に渡す文に使う。コメント・レビューも同じ） */
  body_markdown: string;
  timeline: GitHubTimelineEntry[];
  /** 出来事が多くて途中までしか読めなかった */
  timeline_truncated: boolean;
  /** 自分にできること */
  viewer: GitHubViewerAbilities;
  fetched_at: string;
}

/** PR の中身（会話・チェック。変更は別に読む） */
export interface GitHubPullDetail extends GitHubIssueDetail {
  additions: number;
  deletions: number;
  changed_files: number;
  /** 最新のコミット（変わったら「変更」を取り直す） */
  head_sha: string | null;
  head_owner: string | null;
  mergeable: "mergeable" | "conflicting" | "unknown";
  merge_state: GitHubMergeState;
  /** リポジトリが許すマージの方式 */
  merge_methods: GitHubMergeMethod[];
  /** 自分がマージできる（リポジトリへの書き込みの権限がある） */
  can_merge: boolean;
  review_threads: GitHubReviewThread[];
  checks: GitHubCheck[];
}

/** PR の変更したファイル 1 つ（patch は unified diff の本体。大きすぎる・バイナリなら null） */
export interface GitHubPullFile {
  path: string;
  previous_path: string | null;
  /** added / removed / modified / renamed / copied / changed / unchanged */
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface GitHubPullFiles {
  files: GitHubPullFile[];
  /** 多すぎて途中までしか読めなかった（GitHub は 3,000 件まで） */
  truncated: boolean;
  fetched_at: string;
}

// ---- 段階 3「書く」（コメント・閉じる / 開き直す・ラベル・issue の作成・レビューの送信・マージ・チェックアウト） ----

/** 自分（プロジェクトのアカウント）がこの issue・PR にできること（できないボタンは出さない） */
export interface GitHubViewerAbilities {
  can_close: boolean;
  can_reopen: boolean;
  can_label: boolean;
}

/** issue の閉じ方 */
export const GITHUB_CLOSE_REASONS = ["completed", "not_planned"] as const;
export type GitHubCloseReason = (typeof GITHUB_CLOSE_REASONS)[number];
export const GITHUB_CLOSE_REASON_LABELS: Record<GitHubCloseReason, string> = { completed: "完了として閉じる", not_planned: "対応しないとして閉じる" };

/** マージの方式（リポジトリが許すものだけを選べる） */
export const GITHUB_MERGE_METHODS = ["merge", "squash", "rebase"] as const;
export type GitHubMergeMethod = (typeof GITHUB_MERGE_METHODS)[number];
export const GITHUB_MERGE_METHOD_LABELS: Record<GitHubMergeMethod, string> = { merge: "マージコミットを作る", squash: "1 つにまとめる（squash）", rebase: "リベースして載せる（rebase）" };

/**
 * PR のマージの様子（GitHub の mergeStateStatus）: clean = マージできる・behind = base より古い・blocked = 保護ルールで止まっている（承認・チェック）・
 * dirty = 衝突・unstable = 必須でないチェックが落ちている・has_hooks = フックあり・draft = 下書き・unknown = まだ分からない
 */
export const GITHUB_MERGE_STATES = ["clean", "behind", "blocked", "dirty", "unstable", "has_hooks", "draft", "unknown"] as const;
export type GitHubMergeState = (typeof GITHUB_MERGE_STATES)[number];

/** レビューの送り方 */
export const GITHUB_REVIEW_EVENTS = ["comment", "approve", "request_changes"] as const;
export type GitHubReviewEvent = (typeof GITHUB_REVIEW_EVENTS)[number];
export const GITHUB_REVIEW_EVENT_LABELS: Record<GitHubReviewEvent, string> = { comment: "コメント", approve: "承認", request_changes: "変更依頼" };

/** レビューにためた行のコメント（start_line があれば start_line〜line の範囲） */
export interface GitHubReviewDraftComment {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  start_line: number | null;
  body: string;
}

/** PR のチェックアウトの行き先（新しいワークツリー / 本体） */
export const GITHUB_CHECKOUT_PLACES = ["worktree", "main"] as const;
export type GitHubCheckoutPlace = (typeof GITHUB_CHECKOUT_PLACES)[number];
