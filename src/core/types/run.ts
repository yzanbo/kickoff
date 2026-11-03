// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { ApprovalDecision, ApprovalKind } from "./approval.js";
import type { EffortLevel, PermissionChoice, ProviderId } from "./settings.js";

// チャット（エージェントとの会話）: 実行ごとの選択肢・カンバンの列・エージェントの状態・記録されるイベント
/** チャット欄で選べるモデル */
export interface ModelOption {
  value: string;
  label: string;
  description: string;
  efforts: EffortLevel[];
  supportsAutoMode: boolean;
  supportsFastMode: boolean;
}

/** 実行ごとに選べるオプション（チャット欄の選択） */
export interface RunOptions {
  model?: string | null;
  effort?: EffortLevel | null;
  permission_mode?: PermissionChoice | null;
  fast_mode?: boolean | null;
}

/**
 * カンバンの列。人は動かさず、AI の状態から決まる（boardColumnOf）:
 * 作業中（考えている・順番待ち）→ 回答待ち（承認・質問に答えてほしい）→ 確認待ち（作業が終わった・失敗した。まだ見ていない）→ 完了（見た）
 */
export const BOARD_COLUMNS = ["running", "needs_input", "review", "done"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const BOARD_COLUMN_LABELS: Record<BoardColumn, string> = {
  running: "作業中",
  needs_input: "回答待ち",
  review: "確認待ち",
  done: "完了",
};

/**
 * エージェント自身の状態（状態の分け方に合わせる）。
 * needs_input: 承認・回答待ち / failed: エラー / running: 作業中 / attention: 終わって確認待ち / done: 待機中
 */
const AGENT_STATES = ["needs_input", "failed", "attention", "running", "done"] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export const AGENT_STATE_LABELS: Record<AgentState, string> = {
  needs_input: "回答待ち",
  failed: "エラー",
  attention: "確認待ち",
  running: "作業中",
  done: "待機中",
};

export type RunStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
export interface Run {
  id: number;
  project_id: number;
  provider: ProviderId;
  title: string;
  status: RunStatus;
  session_id: string | null;
  model: string | null;
  /** 推論の深さ（null なら指定しない＝モデルの既定） */
  effort: EffortLevel | null;
  permission_mode: PermissionChoice;
  /** ファストモードを指定したか（SQLite の真偽値 0 / 1） */
  fast_mode: number;
  cost_usd: number;
  num_turns: number;
  result: string | null;
  error: string | null;
  /** AI の作業が終わって、まだ開いて確認していない（SQLite の真偽値 0 / 1） */
  attention: number;
  /** アーカイブした日時（null なら一覧に出す） */
  archived_at: string | null;
  /** サイドバーのプロジェクトの上に固定したか（SQLite の真偽値 0 / 1） */
  pinned: number;
  /** 自分で作ったグループ（null ならグループなし） */
  group_id: number | null;
  /** 作業場所（git のワークツリーのフォルダ。空ならプロジェクトのフォルダ＝本体） */
  worktree_path: string;
  /** 最後に送ったときに作業していたブランチ（ワークツリーを片付けても残す。分からなければ空） */
  branch: string;
  /** いまの作業（最後に送ったもの）を始めた時刻（まだ一度も動いていなければ null） */
  turn_started_at: string | null;
  /** 最後の応答の時点でコンテキストに入っていたトークン数と、その上限（まだ応答がなければ null） */
  context_tokens: number | null;
  context_window: number | null;
  created_at: string;
  updated_at: string;
}

/** チャットを自分でまとめるグループ（プロジェクトごと） */
export interface RunGroup {
  id: number;
  project_id: number;
  name: string;
  /** 並び順（小さいほど上・左） */
  position: number;
  created_at: string;
}

/** チャットのやり取りの検索結果（1 件 = 1 つの発言） */
export interface SearchHit {
  event_id: number;
  run_id: number;
  project_id: number;
  run_title: string;
  /** user: 自分の発言 / text: AI の返答 */
  type: "user" | "text";
  /** キーワードの前後を切り出した文（match_start〜match_end がキーワード） */
  snippet: string;
  match_start: number;
  match_end: number;
  created_at: string;
}

/** チャットの添付ファイル */
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export type RunEventData =
  | { type: "user"; text: string; attachments?: Attachment[] }
  | { type: "init"; model?: string; session_id: string; permission_mode?: string }
  /** sub: サブエージェントの発言。parent: そのサブエージェントを起動した Task / Agent ツールの呼び出し ID */
  | { type: "text"; text: string; sub?: boolean; parent?: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown; sub?: boolean; parent?: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean; parent?: string }
  | { type: "approval"; approval_id: string; kind: ApprovalKind; tool_name: string; title?: string }
  | { type: "approval_resolved"; approval_id: string; action: ApprovalDecision["action"] }
  | { type: "result"; status: RunStatus; text?: string; cost_usd?: number; turns?: number }
  | { type: "error"; message: string }
  | { type: "notice"; message: string }
  /** 会話を要約してコンテキストを空けた（manual: 手で圧縮 / auto: 上限に近づいて自動で）。前後のトークン数 */
  | { type: "compact"; trigger: "manual" | "auto"; pre_tokens: number; post_tokens?: number }
  /** サブエージェントの開始・終了（途中経過は保存せず、run_subagent で届く） */
  | ({ type: "subagent" } & SubagentInfo);

/** サブエージェント（Task / Agent ツールで起動された別のエージェント）の状態 */
export interface SubagentInfo {
  task_id: string;
  /** 起動した Task / Agent ツールの呼び出し ID（タイムラインの呼び出しと結びつける） */
  tool_use_id?: string;
  description: string;
  subagent_type?: string;
  status: "running" | "completed" | "failed" | "stopped";
  tokens?: number;
  tool_uses?: number;
  duration_ms?: number;
  /** 直近に使ったツール（途中経過） */
  last_tool?: string;
  summary?: string;
}

export type RunEventType = RunEventData["type"];

export interface RunEvent {
  id: number;
  run_id: number;
  type: RunEventType;
  data: Omit<RunEventData, "type">;
  created_at: string;
}
