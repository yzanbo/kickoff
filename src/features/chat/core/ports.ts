// chat が宣言し、上の機能が実装する口（chat は上の機能を読まない。組み立てが渡す）
import type { Attachment } from "@shared/chat/types";

/** 添付（attachments が実装する） */
export interface ChatAttachments {
  /** 添付の保存先（AI が読めるフォルダに足す） */
  readonly dir: string;
  /**
   * 送る文に添付のパスを書き添える（エージェントは Read ツールで読む。中身は書かない）。種類ごとに見出しを分ける:
   * ファイル・ノート（写しと元のノートのパス。noteDir はプロジェクトのノートのフォルダ）・「AI に渡す」で取ったもの。見つからない添付は書かない
   */
  promptNote(text: string, attachments: Attachment[], noteDir: string | null): Promise<string>;
  /** 添付のファイルの場所（見つからなければ null） */
  locate(attachment: Attachment): Promise<string | null>;
}
