// HTTP API の本文と応答の形（コアのルートと画面で同じものを使う）。型のみ
// 資源そのもの（Project・Chat・ChatGroup など）は各ファイルにあり、ここには API にだけ出てくる形を置く
import type { Approval } from "./approval";
import type { Attachment, Chat, ChatOptionsPatch } from "./chat";
import type { ChatEvent, HandoffFrom, HandoffVia } from "./chatEvent";
import type { ChatLive, QueueResumeAction, QueueState } from "./chatLive";
import type { Project, ProjectReference } from "./project";
import type { ProviderId } from "./settings";

// ---- 本文（画面が送る形。コアは zod の形をこの型に合わせる） ----

/** 新しいプロジェクト（POST /api/projects）。description は README の「アイデア」にも書く。provider を省けば設定の既定 */
export type NewProjectBody = {
  name: string;
  description?: string;
  parent_dir: string;
  folder_name: string;
  provider?: ProviderId;
  /** git リポジトリとして初期化するか（省くと初期化する） */
  init_git?: boolean;
} & NewProjectMemoDir;

/**
 * 新しいプロジェクト・取り込むプロジェクトのメモのフォルダ（省けば初めてメモを使ったときにプロジェクト名から決める）。
 * memo_folder: 設定のメモの親フォルダの下のフォルダ名（ほかのプロジェクトと重なれば「名前-2」）/ memo_path: このプロジェクトだけ別の場所（絶対パス。memo_folder より優先）
 */
export interface NewProjectMemoDir {
  memo_folder?: string;
  memo_path?: string;
}

/** 既存のフォルダを取り込む（POST /api/projects/import）。init_git なら Git のリポジトリにしてから取り込む */
export type ImportProjectBody = {
  path: string;
  name: string;
  description?: string;
  init_git?: boolean;
  provider?: ProviderId;
} & NewProjectMemoDir;

/**
 * プロジェクトの変更（PATCH /api/projects/:id。書いた項目だけ変える）。tags・chat_defaults・reference_paths は送った内容で置き換える。
 * 参照資料はパスだけ送れば、フォルダかファイルかはサーバーで調べる。archived はしまう（アーカイブ）・戻す
 */
export type ProjectPatch = Partial<Pick<Project, "name" | "description" | "provider" | "hue" | "tags" | "pinned" | "chat_defaults" | "memo_path" | "pre_compact_prompt" | "post_compact_prompt" | "pre_compact_enabled" | "post_compact_enabled">> & {
  archived?: boolean;
  reference_paths?: Pick<ProjectReference, "path">[];
};

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

/** 送る指示（続き・止めずに伝える。POST /api/chats/:id/messages・/tell）。文が空でも、添付があれば送れる */
export interface MessageBody {
  text?: string;
  options?: ChatOptionsPatch;
  attachments?: Attachment[];
}

/**
 * 新しいチャットの最初の指示（POST /api/projects/:id/chats）。作業場所は、いまあるワークツリーのフォルダ（worktree_path）か、
 * 新しく作るワークツリーのブランチ名（new_worktree_branch）。どちらもなければ本体
 */
export interface NewChatBody extends MessageBody {
  group_id?: number;
  worktree_path?: string;
  new_worktree_branch?: string;
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

/** 送信待ちに送る指示（POST /api/chats/:id/queue）。hold なら、作業していなくても送らずに列の最後に足す。pause_after は SendMessageBody と同じ（列に入れたら、その指示のすぐあとに一時停止の印を付ける） */
export interface QueueMessageBody extends SendMessageBody {
  hold?: boolean;
}

/** メモを保存する（PUT /api/projects/:id/memo。base_hash は開いたときの指紋。null なら確かめずに上書き） */
export interface MemoWriteBody {
  path: string;
  content: string;
  base_hash: string | null;
}

/** 新しいメモ・フォルダ（POST /api/projects/:id/memos。dir ならフォルダ） */
export interface MemoCreateBody {
  path: string;
  dir?: boolean;
  content?: string;
}

/** メモの名前を変える・動かす（POST /api/projects/:id/memos/move） */
export interface MemoMoveBody {
  from: string;
  to: string;
}

/**
 * チャットの文からメモを作る・足す（POST /api/projects/:id/memos/from-chat）。summarize なら AI で要約してから。
 * append_to があればそのメモに足し、なければ folder（null なら直下）に「<チャット名> チャットメモ<n>」を作る。
 * merge なら append_to のメモと AI でまとめ直し、メモ全体を書き換える（summarize は見ない）
 */
export interface MemoFromChatBody {
  chat_id: number;
  text: string;
  summarize: boolean;
  merge?: boolean;
  append_to: string | null;
  folder: string | null;
}

/**
 * メモのチャットを始める（POST /api/projects/:id/memo/chat。最初の指示）。path はどのメモについてのチャットか（メモのフォルダからの相対パス）。
 * 続きはふつうのチャットと同じく POST /api/chats/:id/messages
 */
export interface MemoChatBody extends MessageBody {
  path: string;
}

/** AI でメモのフォルダの整理案を作る（POST /api/projects/:id/memos/ai-plan）。instruction は頼み（null ならおまかせ） */
export interface MemoAiPlanBody {
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
}

/** サブエージェントに子チャットで聞く（POST /api/chats/:id/subagents/:agentId/children。サブエージェントの会話の記録を添付にして始める） */
export interface SubagentChildBody {
  text: string;
  options?: ChatOptionsPatch;
  attachments?: Attachment[];
}

// ---- 応答 ----

/** チャットの詳細（GET /api/chats/:id）。作業中の様子 live は SSE の chat_live と同じ形（あとはそれで追いかける） */
export interface ChatDetail {
  chat: Chat;
  events: ChatEvent[];
  /** このチャットの回答待ち（ツールの承認・AI からの質問・再開するかの確かめ） */
  approvals: Approval[];
  live: ChatLive;
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

/** 定型文を作る（POST /api/snippets）。project_id が null なら共通、label が null なら本文の 1 行目を名前に見せる */
export interface NewSnippetBody {
  project_id: number | null;
  label: string | null;
  text: string;
}

/** 定型文を変える（PATCH /api/snippets/:id。書いた項目だけ変える。project_id を null にすると共通に、番号にするとそのプロジェクトだけに） */
export type SnippetPatch = Partial<NewSnippetBody>;

/** 起動したときの送信待ちの確かめに答える（POST /api/queue-resumes。チャットごと） */
export interface QueueResumeBody {
  decisions: { chat_id: number; action: QueueResumeAction }[];
}
