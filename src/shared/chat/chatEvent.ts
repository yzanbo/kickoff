// チャットの記録（chat_events の表）の形。型と定数のみ
import type { ApprovalDecision } from "./approvalTypes";
import type { ApprovalKind } from "@shared/ai/approvals";
import type { Attachment, ChatStatus } from "./types";
import type { ProviderId } from "@shared/settings/types";
import type { AgentEvent } from "@shared/ai/turnEvents";

/** 作業の終わり方（作業中を除いた状態） */
export type TurnEndStatus = Exclude<ChatStatus, "running">;

/** 記録の中身（type ごとに形が決まる）。AI の実行が出す記録（AgentEvent）と、コアが作る記録の合併 */
export type ChatEventData =
  | AgentEvent
  /**
   * message_uuid: Claude Code に渡した発言の ID（ファイルをこの発言を送る前の状態に戻すときの目印）。
   * handover: この発言に添えて渡した、届いていなかったサブエージェントの報告（一覧の行のキー）。
   * pre_compact: 圧縮の前に送った圧縮前指示 / post_compact: 圧縮のあとに送った圧縮後指示（text は設定・プロジェクトの指示そのもの。AI には前置きを付けて送る）。
   * handoff_request: 子チャットに親への依頼文を頼んだ発言（画面は長い頼み方の文の代わりに 1 行で出す）。
   * handoff_from: 子チャットから親チャットに渡した依頼（親チャットの発言。どの子チャットからか）。
   * workplace_continuation: AI が作業場所を移す予約に書いた続きの指示（Kickoff が移したあとに送った）
   */
  | {
      type: "user";
      text: string;
      message_uuid: string;
      attachments?: Attachment[];
      handover?: string[];
      pre_compact?: true;
      post_compact?: true;
      handoff_request?: true;
      handoff_from?: HandoffFrom;
      workplace_continuation?: true;
    }
  | { type: "approval"; approval_id: string; kind: ApprovalKind; tool_name: string; title?: string }
  /**
   * 承認・質問への回答。kind: 何への回答か。AI からの質問に答えたとき（action が answer）は、選んだままの回答と「その他」に添えた添付も残す
   * （画面は自分の発言と同じ吹き出しで「質問への回答」として出す）。拒否したとき（action が deny）は、利用者が書いた理由と添付を残す
   * （画面は自分の発言と同じ吹き出しで「拒否の理由」として出す。理由を書かずに拒否した・中断で拒否になったときは message も attachments もない）
   */
  | { type: "approval_resolved"; approval_id: string; kind: ApprovalKind; action: Exclude<ApprovalDecision["action"], "answer" | "deny"> }
  | { type: "approval_resolved"; approval_id: string; kind: ApprovalKind; action: "deny"; message?: string; attachments?: Attachment[] }
  | {
      type: "approval_resolved";
      approval_id: string;
      kind: ApprovalKind;
      action: "answer";
      answers: Record<string, string | string[]>;
      attachments?: Record<string, Attachment[]>;
      /** 答えた選択肢の図（AskUserQuestion の preview。質問の文 → 図。図のある選択肢を選んだ質問だけ。画面の「質問への回答」で開いて見る） */
      previews?: Record<string, string>;
    }
  /**
   * 作業の終わり。session_id と message_id: その時点の会話の位置（ここから分岐するときに使う。分岐したチャットに写しても元の会話を指す）。
   * network: 通信の切断で失敗した（そのとき動いていたサブエージェントも通信で止まった）。
   * usage_limit: 使用枠の上限で止まった（resets_at: 枠が戻る時刻。分からなければ null）
   */
  | {
      type: "result";
      status: TurnEndStatus;
      text?: string;
      session_id?: string;
      message_id?: string;
      network?: boolean;
      usage_limit?: { resets_at: string | null };
    }
  | { type: "error"; message: string }
  /**
   * コンテキストを消去した（送信待ちのコンテキスト消去の行。チャットのセッションを外し、次の指示から新しい会話で始める。
   * これより前の作業の終わりからは、巻き戻し・子チャットで会話を引き継がない）
   */
  | { type: "context_cleared" }
  /** 同じチャットで担当 AI を替えた区切り。これより前には巻き戻し・分岐・ファイル復元ができない（0029）。 */
  | { type: "provider_switched"; from: ProviderId; to: ProviderId; handoff_attachments?: Attachment[]; queued_ids?: string[]; handoff_context?: string; handoff_status?: "ready" | "blocked" | "delivered" | "superseded" }
  /** 子チャットの答えを親チャットに渡した（子チャットの記録。turn_event_id: どの作業の終わりの答えか。via: 渡し方。parent_chat_id: 渡した先） */
  | { type: "handoff"; via: HandoffVia; parent_chat_id: number; turn_event_id: number }
  /**
   * 作業場所を移した区切り。from / to: 移す前と後の作業場所。reason: なぜ移ったか。
   * carried: コミットしていない変更を持っていった。backed_up: ワークツリーを片付けたとき、コミットしていない変更を控えに入れた。
   * session_id / message_id: 移したあとの会話の起点（新しいセッションに写した、写せなければいまのセッションの、区切りの直前の最後まで終わった作業の終わり。
   * なければ省く）。区切りより前の発言へは巻き戻し・分岐ができず、起点を探すとき区切りを境目にする
   */
  | {
      type: "workplace_moved";
      from: WorkplaceRef;
      to: WorkplaceRef;
      reason: WorkplaceMoveReason;
      carried?: true;
      backed_up?: true;
      /** 元の作業場所で動いている内蔵ターミナル（止めずに残した。AI が移したとき） */
      running?: string[];
      /** 移した先で作業中だったほかのチャットの数（AI が移したとき） */
      busy?: number;
      /** 先にこのチャットのワークツリーを片付けてから移した（AI の移す予約と片付けの予約が重なったとき） */
      after_finish?: true;
      session_id?: string;
      message_id?: string;
    };

/**
 * 作業場所（チャットの、ある時点の）。project_id: どのプロジェクトか / worktree_path: ワークツリーのフォルダ（本体なら null）/
 * branch: そのときのブランチ（分からなければ null）/ dir: 作業フォルダの絶対パス
 */
export interface WorkplaceRef {
  project_id: number;
  worktree_path: string | null;
  branch: string | null;
  dir: string;
}

/**
 * 作業場所が移った理由: 利用者が移した / AI が移した（操作ツール）/ ワークツリーを片付けて本体に戻った / 別のプロジェクトへ移した /
 * プロジェクトのフォルダを変えた
 */
const WORKPLACE_MOVE_REASONS = ["user", "ai", "worktree_finished", "project_moved", "folder_moved"] as const;
export type WorkplaceMoveReason = (typeof WORKPLACE_MOVE_REASONS)[number];

/** 子チャットから親チャットへの渡し方: 親の入力欄に入れる（送るのは自分で）/ 今すぐ送る（作業中ならいまの作業に伝える）/ 親の送信待ちの最後に足す */
export const HANDOFF_VIAS = ["composer", "send", "queue"] as const;
export type HandoffVia = (typeof HANDOFF_VIAS)[number];
/** 渡し方の名前（「親チャットに追加 ▾」のメニュー） */
export const HANDOFF_VIA_LABELS: Record<HandoffVia, string> = { composer: "親の入力欄に入れる", send: "今すぐ送る", queue: "送信待ちに入れる" };
/** 渡し方の短い名前（設定の切り替え・渡したことの印） */
export const HANDOFF_VIA_SHORT: Record<HandoffVia, string> = { composer: "入力欄", send: "今すぐ送る", queue: "送信待ち" };
/** 渡したことの印の渡し方（子チャットの作業の終わりの行の「渡しました · 入力欄へ · 5分前」） */
export const HANDOFF_VIA_MARKS: Record<HandoffVia, string> = { composer: "入力欄へ", send: "送信", queue: "送信待ちへ" };

/**
 * 発言に付ける印（送る・伝える・送信待ち・圧縮が終わるまでの預かりのどの道でも同じ形で通し、発言の記録 user に残す）:
 * handoff_request = 子チャットに親への依頼文を頼んだ発言 / handoff_from = 子チャットから親チャットに渡した依頼
 */
export interface MessageMarks {
  handoff_request?: true;
  handoff_from?: HandoffFrom;
  workplace_continuation?: true;
}

/** 親チャットでの出どころ（どの子チャットから渡した依頼か。名前は渡したときのもの） */
export interface HandoffFrom {
  chat_id: number;
  title: string;
}

export type ChatEventType = ChatEventData["type"];

/** union の形ごとに Omit する（ふつうの Omit は union の形を 1 つに混ぜてしまい、action などで絞り込めなくなる） */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** type の記録の中身（type を除いたもの。approval_resolved のように形が 2 つあるものは、その union） */
export type ChatEventDataOf<T extends ChatEventType> = DistributiveOmit<Extract<ChatEventData, { type: T }>, "type">;

/** 保存した記録の 1 件。type で中身（data）の形が決まる（if (e.type === "text") で e.data.text が読める） */
export type ChatEvent = {
  [T in ChatEventType]: { id: number; chat_id: number; type: T; data: ChatEventDataOf<T>; created_at: string };
}[ChatEventType];

/** type の記録（if で絞ったあとの形を引数・入れ物の型に書くとき） */
export type ChatEventOf<T extends ChatEventType> = Extract<ChatEvent, { type: T }>;
