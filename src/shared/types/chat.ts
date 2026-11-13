// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
import type { EffortLevel, PermissionMode, ProviderId } from "./settings";
import type { MessageMarks } from "./chatEvent";
import type { GitHubKind } from "./github";

// チャット（エージェントとの会話）: 実行ごとの選択肢・カンバンの列・エージェントの状態・記録されるイベント
/** チャット欄で選べるモデル */
export interface ModelOption {
  value: string;
  /** 別名（opus など）が指すモデルの ID（claude-opus-5-5 など。分からなければなし） */
  resolved_model?: string;
  label: string;
  description: string;
  efforts: EffortLevel[];
  supports_auto_mode: boolean;
  supports_fast_mode: boolean;
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
export interface ChatOptions {
  /** モデル（null ならプロバイダーの既定） */
  model: string | null;
  /** 推論の深さ（null なら指定しない＝モデルの既定） */
  effort: EffortLevel | null;
  permission_mode: PermissionMode;
  fast_mode: boolean;
}

/** 選択の一部（送るとき・送信待ち・プロジェクトの既定）。書いていない項目は、次の段（送るとき → プロジェクト → アプリ）に従う */
export type ChatOptionsPatch = Partial<ChatOptions>;

/**
 * カンバンの列。人は動かさず、AI の状態から決まる（boardColumnOf）:
 * 作業中（考えている・順番待ち）→ 回答待ち（承認・質問に答えてほしい）→ 未読（作業が終わった・失敗した。まだ見ていない）→ 既読（見た）。
 * 終わったかどうかより、終わった結果を見たかどうかを分ける（見ていないものを「完了」と呼ばない）
 */
/** 名前が空のチャット（文字を書かずに添付だけで送ったときなど）の代わりの名前（画面・メモ・会話の書き出しで共通。New Chat・No Group とそろえて英語） */
export const UNTITLED_CHAT_TITLE = "Untitled Chat";

/** チャットの名前の文字数の上限（コアの入力の検証・AI がチャットの名前を変えるツール・画面の名前の欄で共通） */
export const CHAT_TITLE_MAX = 100;

export const BOARD_COLUMNS = ["running", "needs_input", "unread", "read"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const BOARD_COLUMN_LABELS: Record<BoardColumn, string> = {
  running: "作業中",
  needs_input: "回答待ち",
  unread: "未読",
  read: "既読",
};

/**
 * エージェント自身の状態（状態の分け方に合わせる）。
 * needs_input: 承認・回答待ち / failed: 失敗してまだ見ていない / running: 作業中 / unread: 終わってまだ見ていない（未読）/ read: 見た（既読）
 */
const AGENT_STATES = ["needs_input", "failed", "unread", "running", "read"] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export const AGENT_STATE_LABELS: Record<AgentState, string> = {
  needs_input: "回答待ち",
  failed: "失敗",
  unread: "未読",
  running: "作業中",
  read: "既読",
};

/** チャットの状態（いまの作業、なければ最後の作業の終わり方）。承認・質問の回答待ちは状態に持たず、回答待ちの一覧から決める（shared/chat/state.ts の agentStateOf） */
export const CHAT_STATUSES = ["running", "completed", "failed", "cancelled"] as const;
export type ChatStatus = (typeof CHAT_STATUSES)[number];
export interface Chat {
  id: number;
  project_id: number;
  provider: ProviderId;
  title: string;
  status: ChatStatus;
  session_id: string | null;
  model: string | null;
  /** 推論の深さ（null なら指定しない＝モデルの既定） */
  effort: EffortLevel | null;
  permission_mode: PermissionMode;
  /** ファストモードを指定したか */
  fast_mode: boolean;
  cost_usd: number;
  num_turns: number;
  /** 最後の作業が失敗したときの理由（なければ null） */
  error: string | null;
  /** AI の作業が終わって、まだ開いて確認していない */
  unread: boolean;
  /** アーカイブした日時（null なら一覧に出す） */
  archived_at: string | null;
  /** サイドバーのプロジェクトの上に固定したか */
  pinned: boolean;
  /** 手動の並び（サイドバーの並び順「手動順」。プロジェクトの中で小さいほど上。null = まだ並べていない新しいチャットで、手動順ではいちばん上） */
  position: number | null;
  /** 自分で作ったグループ（null ならグループなし） */
  group_id: number | null;
  /** 作業場所（git のワークツリーのフォルダ。null ならプロジェクトのフォルダ＝本体） */
  worktree_path: string | null;
  /** 最後に送ったときに作業していたブランチ（ワークツリーを片付けても残す。分からなければ null） */
  branch: string | null;
  /** いまの作業（最後に送ったもの）を始めた時刻（まだ一度も動いていなければ null） */
  turn_started_at: string | null;
  /** 最後の応答の時点でコンテキストに入っていたトークン数と、その上限（まだ応答がなければ null） */
  context_tokens: number | null;
  context_window: number | null;
  /** 親のチャット（子チャットのとき。null なら親のないふつうのチャット。子チャットはサイドバー・ボードに並べず、親の中から開く） */
  parent_chat_id: number | null;
  /** 親の会話のどの記録（発言・返答）から聞いたか（子チャットで、聞いた位置が分かるとき） */
  parent_event_id: number | null;
  /**
   * メモのチャット（メモの右の欄で話す、メモごとに 1 つのチャット）のメモ（メモのフォルダからの相対パス）。null ならふつうのチャット。
   * サイドバー・ボードに並べず、そのメモの右の欄から開く
   */
  memo_path: string | null;
  /** Git で管理していないファイルだけを書けるチャット（ワークツリーの実行環境の［AI で整える］。AI のファイルの書き込みを守りで断る） */
  untracked_only: boolean;
  /** 結び付いた GitHub の issue・PR のリポジトリ（「持ち主/名前」）と番号（どちらも null なら結び付いていない。issue と PR の番号はリポジトリの中で重ならないので種類は持たない） */
  github_repo: string | null;
  github_number: number | null;
  github_kind: GitHubKind | null;
  created_at: string;
  /** 最後に動いた時刻（作った・送った・状態が変わったときに進む。一覧の並び順。印・固定・グループ・作業場所の変更では進めない） */
  active_at: string;
}

/** チャットを自分でまとめるグループ（プロジェクトごと） */
export interface ChatGroup {
  id: number;
  project_id: number;
  name: string;
  /** 並び順（小さいほど上・左） */
  position: number;
  /** 色（色相。プロジェクトの色と同じ 10 色から、同じプロジェクトのほかのグループと被らない色を作ったときに選ぶ。右のパネルのタブのまとまりの色） */
  hue: number;
  created_at: string;
}

/** チャットのやり取りの検索結果（1 件 = 1 つの発言） */
/** フィード（全プロジェクトの画面）の 1 件: チャットごとの、メインエージェントの最新の返答の初めの部分 */
export interface FeedItem {
  chat_id: number;
  event_id: number;
  /** 返答の初めの部分（FEED_TEXT_LIMIT 文字まで。長ければ末尾に …） */
  text: string;
  created_at: string;
}

/** フィードに載せる返答の文字数 */
export const FEED_TEXT_LIMIT = 400;

export interface SearchHit {
  event_id: number;
  chat_id: number;
  project_id: number;
  chat_title: string;
  /** user: 自分の発言 / text: AI の返答 */
  type: "user" | "text";
  /** キーワードの前後を切り出した文（match_start〜match_end がキーワード） */
  snippet: string;
  match_start: number;
  match_end: number;
  created_at: string;
}

/**
 * 送信待ちに指示の代わりに挟む行の種類（compact: 会話を圧縮する / clear: コンテキストを消去する = 次の指示から新しい会話で始める）。
 * 画面の文言は QUEUE_ACTION_LABELS
 */
export const QUEUE_ACTIONS = ["compact", "clear"] as const;
export type QueueAction = (typeof QUEUE_ACTIONS)[number];
export const QUEUE_ACTION_LABELS: Record<QueueAction, string> = { compact: "会話を圧縮", clear: "コンテキストを消去" };

/**
 * 作業中のチャットに送った、次の指示の待ちの列（送信待ち）の 1 件（いまの作業が終わったら順に送る。chat_queues に保存する）。
 * compact なら、指示の代わりに会話を圧縮する行（そこまで送ったら会話を要約してコンテキストを空け、終わったら続きを送る）。
 * clear なら、コンテキストを消去する行（そこまで送ったら、次の指示から新しい会話で始める。記録は残る）。どちらも文・添付・選択は空
 */
export interface QueuedMessage extends MessageMarks {
  id: string;
  text: string;
  attachments: Attachment[];
  options: ChatOptionsPatch;
  created_at: string;
  compact?: boolean;
  clear?: boolean;
  /** 圧縮後指示（圧縮のあとに送る設定・プロジェクトの指示。送ると「圧縮後指示」の札付きの発言になり、AI には前置きを付けて送る） */
  post_compact?: boolean;
}

/**
 * 「AI に渡す」で取ったもの（capture の添付）の出どころの種類。札のアイコン・見出しの名前・外から来た中身かは `@shared/attachment/sources` の表で決める
 */
export const ATTACHMENT_SOURCE_TYPES = ["github_issue", "github_pull", "github_review", "db_failure", "browser_console", "browser_screen", "terminal", "docker_logs", "ci_log"] as const;
export type AttachmentSourceType = (typeof ATTACHMENT_SOURCE_TYPES)[number];

/** capture の添付の出どころ（種類・札と見出しに出す名前「#12 ログインで落ちる」・元を開くリンク） */
export interface AttachmentSource {
  type: AttachmentSourceType;
  label: string;
  url: string | null;
}

interface AttachmentBase {
  id: string;
  name: string;
  mime: string;
  size: number;
}

/** 📎・ドラッグ＆ドロップ・貼り付けで付けたファイル（保存先 uploads のファイル。AI には保存先のパスを書き添える） */
export interface FileAttachment extends AttachmentBase {
  kind: "file";
}

/**
 * メモの添付（チャットのプロジェクトのメモ。memo はメモのフォルダからの相対パス）。付けたときの中身の写しを保存先に置き（id がその写し）、
 * 送るときは写しのパスと元のメモのパスを AI に伝える（頼まれたら元のメモを書き換えてよい）。taken_at は写した時刻。
 * 写しのない古いメモの添付（taken_at なし・size 0）は、送るときのメモのファイルのパスだけを伝える
 */
export interface MemoAttachment extends AttachmentBase {
  kind: "memo";
  memo: string;
  taken_at?: string;
}

/**
 * 「AI に渡す」で押したときの中身をファイルにしたもの（issue・PR・DB のつながらない様子など）。中身はコアが鍵らしい値を伏せ（redacted は伏せた数）、
 * 大きすぎれば頭と終わりを残して切ってから（truncated。original_size は切る前のバイト数）保存先に置く
 */
export interface CaptureAttachment extends AttachmentBase {
  kind: "capture";
  source: AttachmentSource;
  taken_at: string;
  truncated: boolean;
  original_size: number;
  redacted: number;
}

/**
 * チャットの添付（種類 kind で分ける）。チャットの記録・送信待ちに残るので、古い形（kind なし。memo があればメモ）は読むときに
 * `@shared/attachment/normalize` の normalizeAttachment で読み替える（表は作り直さない）
 */
export type Attachment = FileAttachment | MemoAttachment | CaptureAttachment;
