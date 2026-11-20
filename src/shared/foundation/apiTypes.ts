// HTTP API の本文と応答の形（コアのルートと画面で同じものを使う）。型のみ
// 資源そのもの（Project・Chat・ChatGroup など）は各ファイルにあり、ここには API にだけ出てくる形を置く
import type { UserView } from "@shared/userView/types";
import type { Approval } from "@shared/chat/approvalTypes";
import type { Attachment, AttachmentSource, Chat, ChatOptionsPatch } from "@shared/chat/types";
import type { ChatEvent, HandoffFrom, HandoffVia } from "@shared/chat/chatEvent";
import type { ChatLive, RestartResumeAction, QueueState } from "@shared/chat/chatLive";
import type { DbAiAccess, DbColumnInfo, DbEngine, DbEnvironment, DbErPositions, DbFilter, DbObjectPath, DbPrep, DbRowEdit, DbRowFilter, DbSort, DbSsh, DbSsl, DbValue, DbWriteCheck } from "@shared/database/types";
import type { GitHubCheckoutPlace, GitHubCloseReason, GitHubKind, GitHubMergeMethod, GitHubReviewDraftComment, GitHubReviewEvent } from "@shared/github/types";
import type { Project, ProjectReference } from "@shared/projects/types";
import type { ProviderId } from "@shared/settings/types";

// ---- 本文（画面が送る形。コアは zod の形をこの型に合わせる） ----

/** 新しいプロジェクト（POST /api/projects）。description は README の「アイデア」にも書く（空・null はなし）。provider を省けば設定の既定 */
export type NewProjectBody = {
  name: string;
  description?: string | null;
  parent_dir: string;
  folder_name: string;
  provider?: ProviderId;
  /** git リポジトリとして初期化するか（省くと初期化する） */
  init_git?: boolean;
} & NewProjectNoteDir;

/**
 * 新しいプロジェクト・取り込むプロジェクトのノートのフォルダ（省けば初めてノートを使ったときにプロジェクト名から決める）。
 * note_folder: 設定のノートの親フォルダの下のフォルダ名（ほかのプロジェクトと重なれば「名前-2」）/ note_dir: このプロジェクトだけ別の場所（絶対パス。note_folder より優先）
 */
export interface NewProjectNoteDir {
  note_folder?: string;
  note_dir?: string;
}

/** 既存のフォルダを取り込む（POST /api/projects/import）。init_git なら Git のリポジトリにしてから取り込む */
export type ImportProjectBody = {
  path: string;
  name: string;
  description?: string | null;
  init_git?: boolean;
  provider?: ProviderId;
} & NewProjectNoteDir;

/**
 * プロジェクトの変更（PATCH /api/projects/:id。書いた項目だけ変える）。tags・provider_chat_defaults・reference_paths は送った内容で置き換える。
 * 参照資料はパスだけ送れば、フォルダかファイルかはサーバーで調べる。archived はしまう（アーカイブ）・戻す
 */
export type ProjectPatch = Partial<Pick<Project, "name" | "description" | "provider" | "hue" | "tags" | "pinned" | "provider_chat_defaults" | "note_dir" | "pre_compact_prompt" | "post_compact_prompt" | "pre_compact_enabled" | "post_compact_enabled" | "github_account" | "github_remote" | "pr_watch" | "ci_watch">> & {
  archived?: boolean;
  reference_paths?: Pick<ProjectReference, "path">[];
};

/** AI のブラウザでのログインを始めた答え（POST /api/providers/:id/login。画面は auth_url を既定のブラウザで開き、provider_login の知らせを待つ） */
export interface ProviderLoginStart {
  auth_url: string;
}

/**
 * プロジェクトのフォルダ（本体）を変える（PUT /api/projects/:id/repo-path）。取り込みと同じ決まりで、git のルートのフォルダを指す。
 * git でない・コミットがないフォルダは init_git で初期化に同意したときだけ
 */
export interface ProjectRepoPathBody {
  path: string;
  init_git?: boolean;
}

/** チャットの変更（PATCH /api/chats/:id。書いた項目だけ変える。group_id が null ならグループなし。作業中はアーカイブできない） */
export interface ChatPatch {
  title?: string;
  group_id?: number | null;
  pinned?: boolean;
  archived?: boolean;
}

/**
 * 「AI に渡す」で取る中身（POST /api/captures）。コアが鍵らしい値を伏せ、添付の上限を超えれば頭と終わりを残して切ってから保存し、CaptureAttachment を返す。
 * tail_share は残す分のうち終わりに回す割合（ログは多め。省けば半分）。
 * 中身は文 text か、画像 image_base64（ブラウザの画面など。mime は画像の形式。伏せず・切らず、添付の上限を超えれば 400）のどちらか 1 つ
 */
export interface CaptureBody {
  name: string;
  mime?: string;
  text?: string;
  image_base64?: string;
  source: AttachmentSource;
  tail_share?: number;
}

/** 送る指示（続き・止めずに伝える。POST /api/chats/:id/messages・/tell）。文が空でも、添付があれば送れる */
interface MessageBody {
  text?: string;
  options?: ChatOptionsPatch;
  attachments?: Attachment[];
  /** 送った時点の画面の様子（この Mac の画面から送ったときだけ。AI の get_user_view が「発言を送ったときの様子」として読む） */
  user_view?: UserView;
}

/**
 * 新しいチャットの最初の指示（POST /api/projects/:id/chats）。作業場所は、いまあるワークツリーのフォルダ（worktree_path）か、
 * 新しく作るワークツリーのブランチ名（new_worktree_branch）。どちらもなければ本体
 */
export interface NewChatBody extends MessageBody {
  /** 送る前に付けた名前（あれば AI に名前を付けてもらわない） */
  title?: string;
  group_id?: number;
  worktree_path?: string;
  new_worktree_branch?: string;
  /** 結び付ける GitHub の issue・PR（issue から始めた・レビューコメントで直すチャット） */
  github?: GitHubLink;
  /** 動かす AI（省けばプロジェクトの AI。作ったあとは変えない） */
  provider?: ProviderId;
}

/** チャットと GitHub の issue・PR の結び付き（PUT /api/chats/:id/github の本文にも使う） */
export interface GitHubLink {
  /** 「持ち主/名前」 */
  repo: string;
  number: number;
  kind: GitHubKind;
}

/** PR のブランチのワークツリー（POST /api/projects/:id/github/pulls/:number/worktree の応答。いまあればそれ、なければ作ったもの） */
export interface GitHubPullWorktree {
  /** 作業場所（本体で取り出しているなら null） */
  worktree_path: string | null;
  /** 手元のブランチ（元のブランチを remote に持っていればその名前、ほかの人の fork なら pr-N） */
  branch: string;
}

/** GitHub の issue・PR へのコメント（POST /api/projects/:id/github/items/:number/comments。Markdown） */
export interface GitHubCommentBody {
  body: string;
}

/** issue・PR を閉じる / 開き直す（POST …/github/issues|pulls/:number/state。reason は issue を閉じるときだけ） */
export interface GitHubStateBody {
  state: "open" | "closed";
  reason: GitHubCloseReason | null;
}

/** issue・PR のラベルを置き換える（PUT …/github/items/:number/labels。付けるラベルすべて） */
export interface GitHubLabelsBody {
  labels: string[];
}

/** 新しい issue（POST …/github/issues） */
export interface GitHubNewIssueBody {
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
}

/** 作った issue */
export interface GitHubCreatedIssue {
  number: number;
  url: string;
}

/** PR のレビューを送る（POST …/github/pulls/:number/reviews。commit_id は見ていた最新のコミット） */
export interface GitHubReviewBody {
  event: GitHubReviewEvent;
  body: string;
  comments: GitHubReviewDraftComment[];
  commit_id: string | null;
}

/** 行のスレッドへの返信（POST …/github/pulls/:number/threads/:thread/replies） */
export interface GitHubThreadReplyBody {
  body: string;
}

/** 行のスレッドを解決済みにする / 戻す（POST …/github/pulls/:number/threads/:thread/resolve） */
export interface GitHubThreadResolveBody {
  resolved: boolean;
}

/** PR をマージする（POST …/github/pulls/:number/merge。sha は確認で見ていた最新のコミット。その後に積まれていたら GitHub が断る） */
export interface GitHubMergeBody {
  method: GitHubMergeMethod;
  sha: string | null;
}

/** マージの結果（sha はできたコミット） */
export interface GitHubMergeResult {
  sha: string | null;
}

/** PR のチェックアウト（POST …/github/pulls/:number/checkout。応答は GitHubPullWorktree） */
export interface GitHubCheckoutBody {
  place: GitHubCheckoutPlace;
}

/**
 * 続きを送る・止めずに伝える指示（POST /api/chats/:id/messages・/tell）。
 * pause_after なら「質問として送る」: この指示の作業が終わったら、送信待ちを自動で送らずに一時停止する（答えを見て次を決める）
 */
export interface SendMessageBody extends MessageBody {
  pause_after?: boolean;
  /** 子チャットに親への依頼文を頼む発言（記録に印を付ける） */
  handoff_request?: boolean;
  /** 子チャットから渡した依頼（親チャットの発言。どの子チャットからか） */
  handoff_from?: HandoffFrom;
}

/**
 * 子チャットを親から外す（POST /api/chats/:id/detach）。parent_chat_id: null なら親のないチャット（group_id のグループへ。省く・null ならグループなし）、
 * 自分の先祖（親の親より上）の ID ならその子にする（group_id は渡さない）
 */
export interface ChatDetachBody {
  parent_chat_id: number | null;
  group_id?: number | null;
}

/** 送信待ちに送る指示（POST /api/chats/:id/queue）。hold なら、作業していなくても送らずに列の最後に足す。pause_after は SendMessageBody と同じ（列に入れたら、その指示のすぐあとに一時停止の印を付ける） */
export interface QueueMessageBody extends SendMessageBody {
  hold?: boolean;
}

/** ノートを保存する（PUT /api/projects/:id/note。base_hash は開いたときの指紋。null なら確かめずに上書き） */
export interface NoteWriteBody {
  path: string;
  content: string;
  base_hash: string | null;
}

/** 新しいノート・フォルダ（POST /api/projects/:id/notes。dir ならフォルダ） */
export interface NoteCreateBody {
  path: string;
  dir?: boolean;
  content?: string;
}

/** ノートの名前を変える・動かす（POST /api/projects/:id/notes/move） */
export interface NoteMoveBody {
  from: string;
  to: string;
}

/**
 * チャットの文からノートを作る・足す（POST /api/projects/:id/notes/from-chat）。summarize なら AI で要約してから。
 * append_to があればそのノートに足し、なければ folder（null なら直下）に「<チャット名> チャットノート<n>」を作る。
 * merge なら append_to のノートと AI でまとめ直し、ノート全体を書き換える（summarize は見ない）
 */
export interface NoteFromChatBody {
  chat_id: number;
  text: string;
  summarize: boolean;
  merge?: boolean;
  append_to: string | null;
  folder: string | null;
}

/**
 * ノートのチャットを始める（POST /api/projects/:id/note/chat。最初の指示）。path はどのノートについてのチャットか（ノートのフォルダからの相対パス）。
 * 続きはふつうのチャットと同じく POST /api/chats/:id/messages
 */
export interface NoteChatBody extends MessageBody {
  path: string;
}

/** AI でノートのフォルダの整理案を作る（POST /api/projects/:id/notes/ai-plan）。instruction は頼み（null ならおまかせ） */
export interface NoteAiPlanBody {
  instruction: string | null;
}

/** 子チャットで聞く（POST /api/chats/:id/children）。inherit なら親の会話を引き継ぐ。quote は親の会話から選んだ文、event_id は聞いた位置の記録 */
export interface ChildChatBody {
  text: string;
  quote?: string | null;
  inherit?: boolean;
  event_id?: number | null;
  options?: ChatOptionsPatch;
  /** 添付（チャット欄から子チャットに送るとき。文が空でも添付があれば送れる） */
  attachments?: Attachment[];
  /** 動かす AI（省けば親と同じ。違う AI なら会話は引き継がない） */
  provider?: ProviderId;
}

/** サブエージェントに子チャットで聞く（POST /api/chats/:id/subagents/:agentId/children。サブエージェントの会話の記録を添付にして始める） */
export interface SubagentChildBody {
  text: string;
  options?: ChatOptionsPatch;
  attachments?: Attachment[];
}

// ---- 応答 ----

/**
 * チャットの詳細（GET /api/chats/:id）。作業中の様子 live は SSE の chat_live と同じ形（あとはそれで追いかける）。
 * 記録は、クエリがなければすべて。?after=<記録の ID> ならそれより新しい分だけ（つなぎ直したとき）、?limit=n なら終わりから n 件、
 * ?before=<記録の ID>&limit=n ならそれより前の n 件（さかのぼるとき。どれも古い順）
 */
export interface ChatDetail {
  chat: Chat;
  events: ChatEvent[];
  /** events より前の記録がまだあるか（limit で切ったとき） */
  has_earlier: boolean;
  /** after の記録がもうない（巻き戻しで消えた）。events は空なので、すべて読み直す */
  after_missing: boolean;
  /** このチャットの回答待ち（ツールの承認・AI からの質問・再開するかの確かめ） */
  approvals: Approval[];
  live: ChatLive;
  /**
   * 書きかけの返答（作業中に、確定する前の文。SSE の chat_delta で流した分をつないだもの。なければ null）。
   * 返答の途中で開いても、文の頭から出せるように。このあとに届く chat_delta の offset と比べ、持っている分は足さない
   */
  streaming_text: string | null;
  /** streaming_text の長さ（UTF-16。なければ 0。chat_delta の offset と同じ数え方） */
  streaming_length: number;
  /** tail_turns のときだけ: events より前の記録の索引（@shared/chat/chatIndex の規則で選んで軽くしたもの。古い順） */
  index?: ChatEvent[];
  /** tail_turns のときだけ: 頭のターンが大きすぎて途中から読んだ（残りは画面が手すきのときに読む） */
  head_partial?: boolean;
}

/**
 * 止めずに伝えた結果（POST /api/chats/:id/tell）: told = いまのやり取りに足した / queued = 待ちの列に入れた / sent = すぐ送った /
 * held = 圧縮前指示から圧縮のあとのやり取りが終わるまでなので預かった（そのやり取りが終わったら送る。ChatLive の after_compact）
 */
export interface TellResult {
  result: "told" | "queued" | "sent" | "held";
}

/** 子チャットの作業の最後の返答を、親チャットに渡す（POST /api/chats/:id/handoff。turn_event_id は作業の終わりの記録） */
export interface HandoffBody {
  via: HandoffVia;
  turn_event_id: number;
}

/**
 * 親チャットに渡した結果: text = 渡した文（作業の最後の返答。入力欄に入れるときは画面がこれを入れる）・parent_chat_id = 渡した先（直接の親）・
 * sent = 今すぐ送るなら伝えた結果（told / queued / sent / held）、送信待ちなら queued、入力欄なら null
 */
export interface HandoffResult {
  text: string;
  parent_chat_id: number;
  sent: TellResult["result"] | null;
}

/**
 * 次の指示を送った結果（POST /api/chats/:id/queue）。作業中なら送信待ちに入れ（queued と、入れた指示の id）、
 * 作業中でなければすぐ送る（queued: false・id: null）。どちらも、そのあとの送信待ち
 */
export interface QueueAddResult extends QueueState {
  queued: boolean;
  id: string | null;
}

/** 選んだ指示を送らずに 1 件にまとめた結果（POST /api/chats/:id/queue/merge）。id はまとめた 1 件、ほかはそのあとの送信待ち */
export interface QueueMergeResult extends QueueState {
  id: string;
}

/** ファイルを保存した結果（PUT /api/projects/:id/file）。hash は保存したあとの中身の指紋（次に保存するときの base_hash） */
export interface SavedFile {
  hash: string;
}

/** ファイル・フォルダの名前を変えた結果（POST /api/projects/:id/file/rename）。path は変えたあとのパス（作業場所から） */
export interface RenamedFile {
  path: string;
}

/** チャットのやり取りの記録（GET /api/chats/:id/transcript。自分の発言と AI の返答を古い順に並べた Markdown。右クリックの「全部のやり取りをコピー」） */
export interface ChatTranscript {
  markdown: string;
}

/** 録った音声を文にした結果（POST /api/transcribe） */
export interface Transcription {
  text: string;
}

/** 秘密の値（OpenAI の API キーなど）を保存した結果（PUT /api/voice/openai-key）。値そのものは返さず、保存してあるかだけ */
export interface SecretSaved {
  saved: boolean;
}

/** 起動したときの再開の確かめに答える（POST /api/restart-resumes。チャットごと） */
export interface RestartResumeBody {
  decisions: { chat_id: number; action: RestartResumeAction }[];
}

/**
 * DB の接続を作る（POST /api/projects/:id/db-connections）。SQLite は file_path、ほかは host・port・database・username。
 * password: 保存するパスワード（省く・null なら保存しない。値は二度と API に出さない）
 */
export interface NewDbConnectionBody {
  name: string;
  engine: DbEngine;
  environment: DbEnvironment;
  host: string | null;
  port: number | null;
  database: string | null;
  username: string | null;
  file_path: string | null;
  ssl: DbSsl | null;
  read_only: boolean;
  /** 書き込む前の確かめ（作るときに省けば環境の既定） */
  write_check?: DbWriteCheck;
  ai_access: DbAiAccess;
  password?: string | null;
  /** AI が流す SQL に使う別のユーザー（null なら username のまま） */
  ai_username?: string | null;
  /** AI 用のユーザーのパスワード（password と同じく、省けばそのまま・null で消す） */
  ai_password?: string | null;
  /** 接続の手順ノート（ノートのフォルダからの相対パス。null で外す） */
  note_path?: string | null;
  /** SSH トンネル（省けばそのまま・null で使わない） */
  ssh?: DbSsh | null;
  /** SSH のパスワード（password と同じく、省けばそのまま・null で消す） */
  ssh_password?: string | null;
  /** つなぐ前の準備のコマンド（省けばそのまま・null でなし。中身を変えたら確かめ直す） */
  prep?: DbPrep | null;
  /** 次に確かめる日（YYYY-MM-DD）とひとこと */
  check_on?: string | null;
  check_note?: string | null;
}

/** DB の接続を変える（PATCH …/db-connections/:cid。書いた項目だけ。password: 省けばそのまま・null で消す・文字列で替える） */
export type DbConnectionPatch = Partial<NewDbConnectionBody>;

/**
 * つながるか試す（POST …/db-connections/test。保存しない）。connection_id があれば、password を省いたときにその接続の保存したパスワードを使う
 */
export type DbConnectionTestBody = Omit<NewDbConnectionBody, "name" | "read_only" | "write_check" | "ai_access" | "ai_username" | "ai_password" | "note_path" | "check_on" | "check_note"> & { connection_id?: number };

/**
 * 踏み台のサーバーの鍵を見る（POST …/db-connections/ssh-host-key）・受け入れて ~/.ssh/known_hosts に足す（…/ssh-host-key/accept。
 * fingerprints は画面で見せた指紋。読み直した鍵と合わなければ足さない）
 */
export interface DbSshHostKeyBody {
  ssh: DbSsh;
  fingerprints?: string[];
}

/** つながるか試した結果 */
export interface DbConnectionTestResult {
  ok: boolean;
  /** つながったときの DB の版（分かれば） */
  server_version: string | null;
  error: string | null;
  /** 失敗の印（初めての SSH のサーバーなら DB_SSH_UNKNOWN_HOST。画面が鍵を確かめさせる） */
  code?: string;
  /** つなぐのにかかった時間（SSH・準備のコマンドを含む。つなぐ前に断ったときは null） */
  duration_ms: number | null;
}

/** ほかのプロジェクトの接続を写す（POST …/db-connections/copy）。copy_password が false ならパスワードは写さない */
export interface CopyDbConnectionBody {
  from_id: number;
  copy_password: boolean;
}

/** プロジェクトから見つけた接続を取り込む（POST …/db-connections/import。パスワードはコアが見つけた所から読み直す） */
export interface DbImportBody {
  items: { key: string; name: string; environment: DbEnvironment }[];
}

/** テーブルの行を読む（POST …/db-connections/:cid/rows。DB_TABLE_PAGE_ROWS 行まで） */
export interface DbRowsBody {
  path: DbObjectPath;
  table: string;
  sort: DbSort[];
  offset: number;
  /** 絞り込み（省くと絞らない） */
  filter?: DbRowFilter;
}

/** 接続を切った結果（POST …/db-connections/:cid/disconnect。本文 { force }）。コミットしていない SQL のタブがあって force でなければ切らない */
export interface DbDisconnectResult {
  disconnected: boolean;
  /** トランザクションの途中だった SQL のタブ（セッションの名前 = タブのキー。force なら取り消した） */
  pending_sessions: string[];
}

/** SQL のタブの「AI に頼む」（POST …/db-connections/:cid/sql-assist）。path の場所のテーブルと列の名前・いまの SQL・頼みから、AI に 1 回だけ SQL を書いてもらう */
export interface DbSqlAssistBody {
  path: DbObjectPath;
  request: string;
  /** いま入力欄にある SQL（空でよい） */
  sql: string;
}

export interface DbSqlAssistResult {
  sql: string;
}

/** つないでいる接続（GET …/db-connections/connected。木・テーブル・SQL のタブの接続が開いているもの） */
export interface DbConnectedIds {
  ids: number[];
}

/** テーブルの 1 行を全体のまま読む（POST …/db-connections/:cid/full-row。行の詳細で、頭だけ送った長い文字の残りを取る）。filters は行を指すキーの列の条件 */
export interface DbFullRowBody {
  path: DbObjectPath;
  table: string;
  filters: DbFilter[];
}

/** テーブルの 1 行（長い文字も全体のまま。バイナリは大きさと頭のまま） */
export interface DbFullRow {
  columns: DbColumnInfo[];
  row: DbValue[];
}

/** ER 図の中身を読む（POST …/db-connections/:cid/er）。names: 描くテーブル・ビュー（null なら DB_ER_AUTO_MAX 以下のときだけすべて） */
export interface DbErBody {
  path: DbObjectPath;
  names: string[] | null;
}

/** ER 図で動かしたテーブルの位置を覚える（PUT …/db-connections/:cid/er-layout）。place: 場所のキー（erPlace） */
export interface DbErLayoutBody {
  place: string;
  positions: DbErPositions;
}

/** テーブルの行の変更をまとめて保存する（1 つのトランザクション。更新・削除がちょうど 1 行に当たらなければ、すべて取り消す） */
export interface DbEditsBody {
  path: DbObjectPath;
  table: string;
  edits: DbRowEdit[];
  /** 読み取り専用の接続で「書き込む」の間（読み取り専用でない接続は false でよい） */
  write: boolean;
}

/** 保存の結果（変更ごとに変えた行の数） */
export interface DbEditsResult {
  affected: number[];
  duration_ms: number;
}

/** 保存したパスワードをキーチェーンで開けなかったときに、利用者が入れたパスワード（入れた種類だけ。Kickoff を終えるまでコアのメモリにだけ持つ） */
export interface DbEnteredPasswordsBody {
  password?: string;
  ai_password?: string;
  ssh_password?: string;
}

/** SQL のタブで 1 つの文を流す（POST …/db-connections/:cid/sql）。session: SQL のタブごとの接続の ID。write: 「書き込む」の間（読み取り専用を外す） */
export interface DbSqlBody {
  session: string;
  sql: string;
  write: boolean;
  /** 「さらに読む」: 頭のこの行数を飛ばして続きを読む（読み取りの文だけ。流し直すので履歴には残さない。省けば 0） */
  offset?: number;
}

/** チャットの詳細で 1 回に読む記録の数の上限（limit） */
export const CHAT_DETAIL_LIMIT_MAX = 2000;

/** チャットの詳細の記録の読み方（GET /api/chats/:id のクエリ。after と before は一緒に使えない） */
export interface ChatDetailQuery {
  after?: number;
  before?: number;
  limit?: number;
  /**
   * 末尾をターン（作業の終わり result を境目に数える）で数えて読み、それより前は索引（index）で返す（パソコンの画面）。
   * after・before・limit とは一緒に使えない
   */
  tail_turns?: number;
}

/** 記録の一部分（GET /api/chats/:id/events） */
export interface ChatEventPage {
  /** 読んだ記録（古い順） */
  events: ChatEvent[];
  /** events より前の記録がまだあるか */
  has_earlier: boolean;
  /** events の後ろ（until があればその手前まで）に、まだ読んでいない記録があるか（around・after のとき。ほかは false） */
  has_later: boolean;
  /** 頭のターンが大きすぎて、途中から読んだ（CHAT_TURN_MAX_EVENTS / CHAT_TURN_MAX_BYTES） */
  head_partial: boolean;
}

/**
 * GET /api/chats/:id/events のクエリ（どれか 1 つの形）: さかのぼる（before の手前を turns ターン）/ since 以上 before 未満をすべて（頭のターンを埋める・
 * 指定の記録まで読む）/ その記録のターンの前後（遠い所へ移るときの途中の一部分。until の手前まで）/ 途中の一部分から後ろへ（until の手前まで）/
 * サブエージェントの中（parent が parents の中のものと ids の記録。before 未満。parents・ids は , 区切り）
 */
export type ChatEventsQuery =
  | { before: number; turns: number }
  | { before: number; since: number }
  | { around: number; turns: number; until?: number }
  | { after: number; turns: number; until?: number }
  | { parents: string; ids?: string; before: number };

/** チャットの中の検索で読む本文（GET /api/chats/:id/texts?before=<記録の ID>）。自分の発言（user）とメインエージェントの返答（parent のない text）だけ、古い順 */
export interface ChatTexts {
  events: ChatEvent[];
}

/** 開いたときに読む末尾のターンの数（tail_turns。前を読み足す・途中の一部分を読む 1 回も同じ） */
export const CHAT_TAIL_TURNS = 30;
/** 末尾の大きさの上限（記録の data の長さの合計。超えたらターンを減らす。最新のターンは残す） */
export const CHAT_TAIL_MAX_BYTES = 2_000_000;
/** 1 ターンの記録の数と大きさの上限（超えたら終わりからこの分だけ読み、head_partial にする） */
export const CHAT_TURN_MAX_EVENTS = 2000;
export const CHAT_TURN_MAX_BYTES = 4_000_000;

/** チャットの作業場所を移す（POST /api/chats/:id/workplace）。worktree_path: 移す先のワークツリー（本体なら null） */
export interface WorkplaceMoveBody {
  worktree_path: string | null;
  /** 新しいワークツリーへ移すときのブランチの名前（このチャットのいまの作業場所のいまのコミットから作る。あれば worktree_path は見ない） */
  new_worktree_branch?: string;
  /** コミットしていない変更も持っていく（新しいワークツリーのときだけ） */
  carry?: boolean;
}

/** 移す前の確かめの中身（GET /api/chats/:id/workplace） */
export interface WorkplaceMoveCheck {
  /** 元の作業場所のコミットしていない変更（プロジェクトのフォルダの中から見たパス。フォルダがなければ空） */
  changes: string[];
  /** 元の作業場所で動いている内蔵ターミナル（止めずに残す） */
  terminals: { title: string; command: string | null }[];
  /** 片付けを予約したワークツリー（移す先にできない） */
  reserved: string[];
  /** 移せない理由（実行環境を整えるチャット・Git でないプロジェクト。移せれば null） */
  blocked: string | null;
  /** 元の作業場所のフォルダがない（変更の確かめは飛ばす） */
  missing: boolean;
}
