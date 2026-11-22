import type { ChatOptionsPatch, EffortLevel, PermissionMode, ProviderId } from "@shared/settings/types";
import type { MessageMarks } from "./chatEvent";
import type { GitHubKind } from "@shared/github/types";

// チャット（エージェントとの会話）: 実行ごとの選択肢・カンバンの列・エージェントの状態・記録されるイベント
/** 実行ごとに選べるオプション（チャット欄の選択）と、その一部（定義は値の一覧の隣 @shared/settings/types。設定・AI の画面も読む） */
export type { ChatOptions, ChatOptionsPatch } from "@shared/settings/types";

/** 名前が空のチャット（文字を書かずに添付だけで送ったときなど）の代わりの名前（画面・ノート・会話の書き出しで共通。New Chat・No Group とそろえて英語） */
export const UNTITLED_CHAT_TITLE = "Untitled Chat";

/** 名前が空のチャットを、AI に返す文の中で呼ぶ名前（画面の名前とは分ける） */
const UNTITLED_FOR_AI = "（名前なし）";

/** 文の中のチャットの名前（前後の空白を除き、空なら ai は「（名前なし）」・ui は UNTITLED_CHAT_TITLE） */
export function chatName(chat: string | { title: string }, audience: "ai" | "ui"): string {
  const title = typeof chat === "string" ? chat : chat.title;
  return title.trim() || (audience === "ai" ? UNTITLED_FOR_AI : UNTITLED_CHAT_TITLE);
}

/** チャットの名前の文字数の上限（コアの入力の検証・AI がチャットの名前を変えるツール・画面の名前の欄で共通） */
export const CHAT_TITLE_MAX = 100;

/**
 * カンバンの列。人は動かさず、AI の状態から決まる（boardColumnOf）:
 * 作業中（考えている・順番待ち）→ 回答待ち（承認・質問に答えてほしい）→ 未読（作業が終わった・失敗した。まだ見ていない）→ 既読（見た）。
 * 終わったかどうかより、終わった結果を見たかどうかを分ける（見ていないものを「完了」と呼ばない）。並びは @shared/chatList/urgency.ts の URGENCY_ORDER
 */
export type BoardColumn = "running" | "needs_input" | "unread" | "read";

/**
 * エージェント自身の状態（状態の分け方に合わせる）。
 * needs_input: 承認・回答待ち / failed: 失敗してまだ見ていない / running: 作業中 / unread: 終わってまだ見ていない（未読）/ read: 見た（既読）
 */
const AGENT_STATES = ["needs_input", "failed", "unread", "running", "read"] as const;
export type AgentState = (typeof AGENT_STATES)[number];

/** チャットの状態（いまの作業、なければ最後の作業の終わり方）。承認・質問の回答待ちは状態に持たず、回答待ちの一覧から決める（shared/chat/state.ts の agentStateOf） */
const CHAT_STATUSES = ["running", "completed", "failed", "cancelled"] as const;
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
  /** このチャットでコマンドの砂場を使うか（作成時の既定） */
  sandbox_enabled: boolean;
  /** このチャットで Kickoff の編集先の制限を使うか（作成時の既定） */
  edit_scope_enabled: boolean;
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
  /** ワークツリーを片付けて本体に戻したとき、片付けたワークツリーのブランチ（次に送る・作業場所を移すまで。札は本体のまま、説明にだけ出す。片付けていなければ null） */
  finished_worktree_branch: string | null;
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
   * ノートのチャット（ノートの右の欄で話す、ノートごとに 1 つのチャット）のノート（ノートのフォルダからの相対パス）。null ならふつうのチャット。
   * サイドバー・ボードに並べず、そのノートの右の欄から開く
   */
  note_path: string | null;
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

/** チャットの変更（PATCH /api/chats/:chatId。書いた項目だけ変える。group_id が null ならグループなし。作業中はアーカイブできない） */
export interface ChatPatch {
  title?: string;
  group_id?: number | null;
  pinned?: boolean;
  archived?: boolean;
}

/** チャットと GitHub の issue・PR の結び付き（PUT /api/chats/:chatId/github の本文・新しいチャットの github） */
export interface GitHubLink {
  /** 「持ち主/名前」 */
  repo: string;
  number: number;
  kind: GitHubKind;
}

/**
 * 送る指示（新しいチャット・続き・止めずに伝える・送信待ち・ノートのチャットで同じ形）。文が空でも、添付があれば送れる。
 * user_view は送った時点の画面の様子（この Mac の画面から送ったときだけ。形を確かめて覚えるのは userView。AI の get_user_view が読む）
 */
export interface MessageBody {
  text?: string;
  options?: ChatOptionsPatch;
  attachments?: Attachment[];
  user_view?: unknown;
}

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

/** チャットのやり取りの検索結果（1 件 = 1 つの発言） */
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
 * 作業中のチャットに送った、次の指示の待ちの列（送信待ち）の 1 件（いまの作業が終わったら順に送る。出す箱 chat_outbox に保存する）。
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
export const ATTACHMENT_SOURCE_TYPES = ["github_issue", "github_pull", "github_review", "db_failure", "browser_console", "browser_screen", "browser_selection", "terminal", "docker_logs", "ci_log"] as const;
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
 * ノートの添付（チャットのプロジェクトのノート。note はノートのフォルダからの相対パス）。付けたときの中身の写しを保存先に置き（id がその写し）、
 * 送るときは写しのパスと元のノートのパスを AI に伝える（頼まれたら元のノートを書き換えてよい）。taken_at は写した時刻
 */
export interface NoteAttachment extends AttachmentBase {
  kind: "note";
  note: string;
  taken_at: string;
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

/** チャットの添付（種類 kind で分ける） */
export type Attachment = FileAttachment | NoteAttachment | CaptureAttachment;

/**
 * チャットで外の画像の表示を許可したホスト。返答の外の画像は「ホストから画像を n 件表示」を押すまで読み込まず、
 * 押したホストはそのチャットの中だけ覚えて、以後は押さずに表示する（分岐では写し、子チャットには引き継がない）
 */
export interface ChatImageHost {
  /** ホスト名（小文字。ポートがあれば「:ポート」付き） */
  host: string;
  allowed_at: string;
}
