// CI の結果（GitHub Actions の実行・ジョブ・ステップ・ログと、外の CI の成否）の形。中身は DB に持たず、開くたびに GitHub に聞く

/**
 * 実行・ジョブ・ステップ・外の CI の状態（GitHub の status / conclusion を 1 つにしたもの）。
 * pending = 待っている・動いている / success / failure（時間切れ・起動の失敗も） / cancelled / skipped / neutral
 */
export const CI_STATES = ["pending", "success", "failure", "cancelled", "skipped", "neutral"] as const;
export type CiState = (typeof CI_STATES)[number];
export const CI_STATE_LABELS: Record<CiState, string> = {
  pending: "実行中",
  success: "通った",
  failure: "落ちた",
  cancelled: "取り消した",
  skipped: "飛ばした",
  neutral: "どちらでもない",
};

/** GitHub Actions の実行 1 つ */
export interface CiRun {
  /** 実行の ID（GitHub の workflow run の id） */
  id: number;
  /** ワークフローの名前（「CI」） */
  workflow: string;
  /** そのワークフローの何回目か（#482） */
  number: number;
  /** 何度目の試み（やり直すと増える） */
  attempt: number;
  /** 実行の題（コミットのメッセージの 1 行目・PR の題など） */
  title: string;
  branch: string | null;
  /** きっかけ（push / pull_request / workflow_dispatch など） */
  event: string;
  sha: string;
  state: CiState;
  url: string;
  /** その実行に結び付いた PR の番号（push の実行は空） */
  pulls: number[];
  /** 起こした人のログイン名 */
  actor: string | null;
  created_at: string;
  updated_at: string;
}

/** 外の CI（GitHub Actions でないもの。成否と GitHub に来るリンクだけ） */
export interface CiExternalCheck {
  name: string;
  branch: string;
  sha: string;
  state: CiState;
  description: string | null;
  url: string | null;
  updated_at: string | null;
}

/** CI のタブの一覧 */
export interface CiRunList {
  runs: CiRun[];
  /** 見張っているブランチの先頭のコミットの、外の CI の成否 */
  external: CiExternalCheck[];
  /** 既定のブランチ（main など。「（ブランチ名）で直す」で本体を選ぶ） */
  default_branch: string | null;
  /** 作業場所（本体・各ワークツリー）でいま取り出しているブランチ（外の CI を聞き、失敗を知らせるブランチ） */
  workplace_branches: string[];
  fetched_at: string;
}

/** ジョブのステップ 1 つ */
export interface CiStep {
  number: number;
  name: string;
  state: CiState;
}

/** ジョブ 1 つ */
export interface CiJob {
  id: number;
  name: string;
  state: CiState;
  started_at: string | null;
  completed_at: string | null;
  url: string | null;
  steps: CiStep[];
}

/** 実行の中身（ジョブとステップ） */
export interface CiRunDetail {
  run: CiRun;
  jobs: CiJob[];
  fetched_at: string;
}

/** ジョブのログ（ステップごとに分けたもの。動いている最中のジョブは GitHub がまだ出さないので available: false） */
export interface CiJobLog {
  job_id: number;
  available: boolean;
  /** 出せない理由（動いている・GitHub が消した など） */
  reason: string | null;
  steps: CiStepLog[];
}

/** ステップ 1 つのログ（行の頭の時刻は外し、色の制御文字は残す） */
export interface CiStepLog {
  /** ステップの名前（ジョブのステップの name と同じ） */
  name: string;
  lines: string[];
}

/** 失敗したステップのログ（「AI に渡す」の札の中身。gh run view --log-failed で取れる範囲） */
export interface CiFailedLog {
  run: CiRun;
  /** ジョブ・ステップごと（行の頭の時刻と色の制御文字は外す） */
  steps: { job: string; step: string; lines: string[] }[];
}

/** 「（ブランチ名）で直す」の作業場所（worktree_path が null なら本体） */
export interface CiRunWorktree {
  worktree_path: string | null;
  branch: string;
}

/** やり直し（failed = 失敗したジョブだけ） */
export interface CiRerunBody {
  failed: boolean;
}

/** 見張っているブランチで落ちた実行（Mac の通知に出す。同じ実行は 1 回だけ） */
export interface CiFailure {
  project_id: number;
  run_id: number;
  workflow: string;
  number: number;
  branch: string;
  title: string;
  url: string;
}
