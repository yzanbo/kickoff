// ノートの API の本文の型（取り決めは contract.ts）
import type { MessageBody } from "@shared/chat/types";

/** ノートを保存する（PUT /api/projects/:projectId/note。base_hash は開いたときの指紋。null なら確かめずに上書き） */
export interface NoteWriteBody {
  path: string;
  content: string;
  base_hash: string | null;
}

/** 新しいノート・フォルダ（POST /api/projects/:projectId/notes。dir ならフォルダ） */
export interface NoteCreateBody {
  path: string;
  dir?: boolean;
  content?: string;
}

/** ノートの名前を変える・動かす（POST /api/projects/:projectId/notes/move） */
export interface NoteMoveBody {
  from: string;
  to: string;
}

/**
 * チャットの文からノートを作る・足す（POST /api/projects/:projectId/notes/from-chat）。summarize なら AI で要約してから。
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
 * ノートのチャットを始める（POST /api/projects/:projectId/note/chat。最初の指示）。path はどのノートについてのチャットか（ノートのフォルダからの相対パス）。
 * 続きはふつうのチャットと同じく POST /api/chats/:id/messages
 */
export interface NoteChatBody extends MessageBody {
  path: string;
}

/** AI でノートのフォルダの整理案を作る（POST /api/projects/:projectId/notes/ai-plan）。instruction は頼み（null ならおまかせ） */
export interface NoteAiPlanBody {
  instruction: string | null;
}
