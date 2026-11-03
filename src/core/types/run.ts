// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { ApprovalDecision, ApprovalKind } from "./approval.js";
import type { EffortLevel, PermissionChoice, ProviderId } from "./settings.js";

// チャット（エージェントとの会話）: 実行ごとの選択肢・カンバンの列・エージェントの状態・記録されるイベント
/** チャット欄で選べるモデル */
export interface ModelOption {
  value: string;
  /** 別名（opus など）が指すモデルの ID（claude-opus-5-5 など。分からなければなし） */
  resolvedModel?: string;
  label: string;
  description: string;
  efforts: EffortLevel[];
  supportsAutoMode: boolean;
  supportsFastMode: boolean;
}

/**
 * 推論の深さを指定しないとき（既定）に Claude Code が使う深さ。effort が null ならモデルの既定（値は分からない）。
 * source はどこで決まったか（env = 環境変数 / local・project = 作業フォルダの .claude / user = ~/.claude）
 */
export interface EffortDefault {
  effort: EffortLevel | null;
  source: "env" | "local" | "project" | "user" | null;
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
 * 作業中（考えている・順番待ち）→ 回答待ち（承認・質問に答えてほしい）→ 未読（作業が終わった・失敗した。まだ見ていない）→ 既読（見た）。
 * 終わったかどうかより、終わった結果を見たかどうかを分ける（見ていないものを「完了」と呼ばない）
 */
export const BOARD_COLUMNS = ["running", "needs_input", "review", "done"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const BOARD_COLUMN_LABELS: Record<BoardColumn, string> = {
  running: "作業中",
  needs_input: "回答待ち",
  review: "未読",
  done: "既読",
};

/**
 * エージェント自身の状態（状態の分け方に合わせる）。
 * needs_input: 承認・回答待ち / failed: 失敗してまだ見ていない / running: 作業中 / attention: 終わってまだ見ていない（未読）/ done: 見た（既読）
 */
const AGENT_STATES = ["needs_input", "failed", "attention", "running", "done"] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export const AGENT_STATE_LABELS: Record<AgentState, string> = {
  needs_input: "回答待ち",
  failed: "エラー",
  attention: "未読",
  running: "作業中",
  done: "既読",
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
  /** ファストモードを指定したか */
  fast_mode: boolean;
  cost_usd: number;
  num_turns: number;
  result: string | null;
  error: string | null;
  /** AI の作業が終わって、まだ開いて確認していない */
  attention: boolean;
  /** アーカイブした日時（null なら一覧に出す） */
  archived_at: string | null;
  /** サイドバーのプロジェクトの上に固定したか */
  pinned: boolean;
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
  /** 最後に動いた時刻（作った・送った・状態が変わったときに進む。一覧の並び順。印・固定・グループ・作業場所の変更では進めない） */
  active_at: string;
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

/** 作業中のチャットに送った、次の指示の待ちの列の 1 件（いまの作業が終わったら順に送る。保存しない） */
export interface QueuedMessage {
  id: string;
  text: string;
  attachments: Attachment[];
  options: RunOptions;
  created_at: string;
}

/** チャットの添付ファイル */
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
}

/** AI の API への通信を Claude Code が再試行しているところ（通信が切れたときなど。保存しない） */
export interface ApiRetryInfo {
  attempt: number;
  max_retries: number;
  retry_delay_ms: number;
  /** 知らせを受けた時刻（次に送り直すまでの残りを数える） */
  at: string;
}

/** 裏で動いている作業の 1 件（サブエージェント・裏で動かしたコマンドなど。Claude Code の background_tasks_changed） */
export interface BackgroundTask {
  /** 作業 ID（サブエージェントなら、その ID。SendMessage の宛先にも使う） */
  task_id: string;
  kind: "agent" | "command" | "other";
  description: string;
  subagent_type?: string;
}

/**
 * 裏で動いている作業の様子（保存しない）。tasks はいま動いているものすべて（知らせのたびに丸ごと置き換える）。
 * replied: メインの返答は書き終わっていて、裏の作業の終わりを待っているだけか
 */
export interface BackgroundState {
  tasks: BackgroundTask[];
  replied: boolean;
}

/** 通信が切れて止まったチャットの、つながったら自動で再開するのを待っている状態（保存しない） */
export interface ReconnectState {
  /** これまでに自動で再開した回数 */
  attempts: number;
  /** 自動で再開する回数の上限（超えたら人に聞く） */
  max: number;
}

export type RunEventData =
  | { type: "user"; text: string; attachments?: Attachment[] }
  /** effort: 実際に使った推論の深さ（Claude Code が知らせたときだけ。null は深さを送らないモデル） */
  | { type: "init"; model?: string; session_id: string; permission_mode?: string; effort?: string | null }
  /** sub: サブエージェントの発言。parent: そのサブエージェントを起動した Task / Agent ツールの呼び出し ID */
  | { type: "text"; text: string; sub?: boolean; parent?: string }
  /** 思考（text は既定では空）。duration_ms: 考えていた時間（メインのエージェントで、測れたときだけ） */
  | { type: "thinking"; text: string; duration_ms?: number; sub?: boolean; parent?: string }
  | { type: "tool_use"; id: string; name: string; input: unknown; sub?: boolean; parent?: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean; parent?: string }
  | { type: "approval"; approval_id: string; kind: ApprovalKind; tool_name: string; title?: string }
  | { type: "approval_resolved"; approval_id: string; action: ApprovalDecision["action"] }
  /** 作業の終わり。session_id と message_id: その時点の会話の位置（ここから分岐するときに使う。分岐したチャットに写しても元の会話を指す） */
  | {
      type: "result";
      status: RunStatus;
      text?: string;
      cost_usd?: number;
      turns?: number;
      session_id?: string;
      message_id?: string;
      /** 通信の切断で失敗した（そのとき動いていたサブエージェントも通信で止まった） */
      network?: boolean;
    }
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
