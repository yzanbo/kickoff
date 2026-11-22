// chat が宣言し、上の機能が実装する口（chat は上の機能を読まない。組み立てが渡す）
import type { DatabaseSync } from "node:sqlite";
import type { HandoffState } from "@shared/chat/chatLive";
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

/** AI を替えたあとの引き継ぎ（いまの引き継ぎだけ。資料は providerSwitch の contributor が添える） */
export interface PendingProviderHandoff {
  /** 切り替えた区切り（provider_switched）の記録 */
  eventId: number;
  /** 引き継ぐ先の AI */
  provider: ProviderId;
  state: HandoffState;
}

/**
 * 引き継ぎの状態の口（providerSwitch が実装し、組み立てが chat を作るときに渡す。起動したときの確かめが chat を作る中で走るため）。
 * 殻の決まりの門・作業中の様子・やり直し・消去・会話記録の片付けが読む
 */
export interface ProviderHandoffPort {
  /** そのチャットのいまの引き継ぎ（なければ null） */
  pending(chatId: number): PendingProviderHandoff | null;
  /** AI を切り替えられない理由（引き継ぎの途中。切り替えてよければ null） */
  blocksSwitch(chatId: number, current: ProviderId): string | null;
  /** 引き継ぎのやり直しに失敗した（resend = 記録した指示を送り直していた。どちらも再試行を待つ） */
  failed(chatId: number, eventId: number, error: string, resend: boolean): void;
  /** 受信不明の引き継ぎを、利用者が承知して送り直す（状態が変わっていれば false） */
  confirmResend(chatId: number, eventId: number): boolean;
  /** 起動のとき: 送っている途中で終わった引き継ぎを受信不明にする */
  onBoot(): void;
  /** コンテキストを消去した: 離れた AI のセッションの覚えを捨てる（戻しても消去前の会話を再開しない） */
  cleared(chatId: number): void;
  /** そのチャットが覚えている離れた AI のセッション（会話記録の片付けで、使っているものとして数える） */
  sessionsOf(chatId: number): { session_id: string; provider: ProviderId }[];
  /** どれかのチャットが離れた AI のセッションとして覚えている ID（会話記録を片付けるかの判定） */
  rememberedSessions: RememberedSessionIds;
}

/**
 * chat の表のほかで覚えているセッションの ID（ids を渡せばそのうち覚えているものだけ。db を渡せば、ほかの Kickoff の DB（読むだけで開いたもの）で調べる。
 * 表がないなど読めなければ投げる）
 */
export type RememberedSessionIds = (ids?: readonly string[], db?: DatabaseSync) => Set<string>;
