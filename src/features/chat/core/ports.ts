// chat が宣言し、上の機能が実装する口（chat は上の機能を読まない。組み立てが渡す）
import type { Attachment, Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import type { ProviderId } from "@shared/settings/types";

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
  /** AI からの質問への回答に、質問ごとに添えた添付のパスを書き添える（見つからない添付は書かない。複数選ぶ質問は最後の答えに） */
  answers(answers: Record<string, string | string[]>, attachments: Record<string, Attachment[]> | undefined): Promise<Record<string, string | string[]>>;
  /** 本当に消したチャットの添付のうち、どこからも使われなくなったものを消す（見つからない・消せないものは飛ばす） */
  discard(ids: string[]): Promise<void>;
}

/** 子チャットを親から外す（childChats が実装する。AI の update_chat の parent_id。断るときは理由の文で投げる） */
export interface ChatDetachPort {
  /** parentId が null なら親のないチャット（groupId のグループへ）、先祖の ID ならその子に上げる。外したあとのチャットを返す */
  detach(chat: Chat, target: { parentId: number | null; groupId?: number | null }): Chat;
}

/** AI の切り替えの準備と確定（providerSwitch が実装する。段取り = 作業中でないと確かめる・準備の段階・送信待ちの形の確かめは chat の殻） */
export interface ProviderSwitchPort {
  /** 会話と Git の状態を準備して、担当 AI・区切り・次に送る資料をまとめて書く（requireStable: 準備の前後で自分の番のままか確かめる） */
  commit(input: { chatId: number; expectedProvider: ProviderId; target: ProviderId; queueWasPaused: boolean; queuedIds: string[] }, requireStable: () => void): Promise<{ chat: Chat; warning: string | null }>;
  /** 準備に失敗した引き継ぎを、切り替えた時点までの記録から組み直す（claim: 記録した指示を送り直す） */
  retry(chatId: number, claim: boolean, requireStable: () => void): Promise<{ warning: string | null }>;
}
