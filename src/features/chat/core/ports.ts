// chat が宣言し、上の機能が実装する口（chat は上の機能を読まない。組み立てが渡す）
import type { Attachment, Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";

/** 添付（attachments が実装する） */
export interface ChatAttachments {
  /** 添付の保存先（AI が読めるフォルダに足す） */
  readonly dir: string;
  /**
   * 送る文に添付のパスを書き添える（エージェントは Read ツールで読む。中身は書かない）。種類ごとに見出しを分ける:
   * ファイル・ノート（写しと、そのプロジェクトのノートのフォルダの元のノートのパス）・「AI に渡す」で取ったもの。見つからない添付は書かない
   */
  promptNote(text: string, attachments: Attachment[], project: Project | null): Promise<string>;
  /** 添付のファイルの場所（見つからなければ null） */
  locate(attachment: Attachment): Promise<string | null>;
}

/** 子チャットを親から外す（childChats が実装する。AI の update_chat の parent_id。断るときは理由の文で投げる） */
export interface ChatDetachPort {
  /** parentId が null なら親のないチャット（groupId のグループへ）、先祖の ID ならその子に上げる。外したあとのチャットを返す */
  detach(chat: Chat, target: { parentId: number | null; groupId?: number | null }): Chat;
}
