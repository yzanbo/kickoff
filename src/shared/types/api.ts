// HTTP API の本文と応答の形（コアのルートと画面で同じものを使う）。型のみ
// 資源そのもの（Project・Chat・ChatGroup など）は各ファイルにあり、ここには API にだけ出てくる形を置く
import type { Approval } from "./approval";
import type { Attachment, Chat, ChatOptionsPatch } from "./chat";
import type { ChatEvent } from "./chatEvent";
import type { ChatLive, QueueState } from "./chatLive";
import type { Project, ProjectReference } from "./project";
import type { ProviderId } from "./settings";

// ---- 本文（画面が送る形。コアは zod の形をこの型に合わせる） ----

/** 新しいプロジェクト（POST /api/projects）。description は README の「アイデア」にも書く。provider を省けば設定の既定 */
export interface NewProjectBody {
  name: string;
  description?: string;
  parent_dir: string;
  folder_name: string;
  provider?: ProviderId;
}

/** 既存のフォルダを取り込む（POST /api/projects/import）。init_git なら Git のリポジトリにしてから取り込む */
export interface ImportProjectBody {
  path: string;
  name: string;
  description?: string;
  init_git?: boolean;
  provider?: ProviderId;
}

/**
 * プロジェクトの変更（PATCH /api/projects/:id。書いた項目だけ変える）。tags・chat_defaults・reference_paths は送った内容で置き換える。
 * 参照資料はパスだけ送れば、フォルダかファイルかはサーバーで調べる。archived はしまう（アーカイブ）・戻す
 */
export type ProjectPatch = Partial<Pick<Project, "name" | "description" | "provider" | "hue" | "tags" | "pinned" | "chat_defaults" | "memo_path">> & {
  archived?: boolean;
  reference_paths?: Pick<ProjectReference, "path">[];
};

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

/** 送信待ちに送る指示（POST /api/chats/:id/queue）。hold なら、作業していなくても送らずに列の最後に足す */
export interface QueueMessageBody extends MessageBody {
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
 * append_to があればそのメモに足し、なければ folder（null なら直下）に「<チャット名> チャットメモ<n>」を作る
 */
export interface MemoFromChatBody {
  chat_id: number;
  text: string;
  summarize: boolean;
  append_to: string | null;
  folder: string | null;
}

/** 子チャットで聞く（POST /api/chats/:id/children）。inherit なら親の会話を引き継ぐ。quote は親の会話から選んだ文、event_id は聞いた位置の記録 */
export interface ChildChatBody {
  text: string;
  quote?: string | null;
  inherit?: boolean;
  event_id?: number | null;
  options?: ChatOptionsPatch;
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

/** 止めずに伝えた結果（POST /api/chats/:id/tell）: told = いまのやり取りに足した / queued = 待ちの列に入れた / sent = すぐ送った */
export interface TellResult {
  result: "told" | "queued" | "sent";
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

/** 録った音声を文にした結果（POST /api/transcribe） */
export interface Transcription {
  text: string;
}

/** 秘密の値（OpenAI の API キーなど）を保存した結果（PUT /api/voice/openai-key）。値そのものは返さず、保存してあるかだけ */
export interface SecretSaved {
  saved: boolean;
}
