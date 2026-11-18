// チャットの記録（chat_events の表）の形。型と定数のみ
import type { ApprovalDecision, ApprovalKind } from "./approval";
import type { Attachment, ChatStatus } from "./chat";
import type { ProviderId } from "./settings";

/** 作業の終わり方（作業中を除いた状態） */
export type TurnEndStatus = Exclude<ChatStatus, "running">;

/** 記録の中身（type ごとに形が決まる） */
export type ChatEventData =
  /**
   * message_uuid: Claude Code に渡した発言の ID（ファイルをこの発言を送る前の状態に戻すときの目印）。
   * handover: この発言に添えて渡した、届いていなかったサブエージェントの報告（一覧の行のキー）。
   * pre_compact: 圧縮の前に送った圧縮前指示 / post_compact: 圧縮のあとに送った圧縮後指示（text は設定・プロジェクトの指示そのもの。AI には前置きを付けて送る）。
   * handoff_request: 子チャットに親への依頼文を頼んだ発言（画面は長い頼み方の文の代わりに 1 行で出す）。
   * handoff_from: 子チャットから親チャットに渡した依頼（親チャットの発言。どの子チャットからか）。
   * workplace_continuation: AI が作業場所を移す予約に書いた続きの指示（Kickoff が移したあとに送った。メモの仕様書「0025」の段階 ③）
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
  /** effort: 実際に使った推論の深さ（Claude Code が知らせたときだけ。null は深さを送らないモデル） */
  | { type: "init"; session_id: string; model?: string; permission_mode?: string; effort?: string | null }
  /** parent: サブエージェントの発言なら、そのサブエージェントを起動した Task / Agent ツールの呼び出し ID（メインの発言にはない） */
  | { type: "text"; text: string; parent?: string }
  /** 思考（text は既定では空）。duration_ms: 考えていた時間（メインエージェントで、測れたときだけ） */
  | { type: "thinking"; text: string; duration_ms?: number; parent?: string }
  | { type: "tool_use"; id: string; name: string; input: unknown; parent?: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean; parent?: string }
  | { type: "approval"; approval_id: string; kind: ApprovalKind; tool_name: string; title?: string }
  /**
   * 承認・質問への回答。kind: 何への回答か。AI からの質問に答えたとき（action が answer）は、選んだままの回答と「その他」に添えた添付も残す
   * （画面は自分の発言と同じ吹き出しで「質問への回答」として出す）
   */
  | { type: "approval_resolved"; approval_id: string; kind: ApprovalKind; action: Exclude<ApprovalDecision["action"], "answer"> }
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
  | { type: "notice"; message: string }
  /**
   * 会話を要約してコンテキストを空けた（manual: 手で圧縮 / auto: 上限に近づいて自動で）。前後のトークン数。
   * duration_ms: 圧縮にかかった時間（Claude Code が知らせたときだけ。記録の時刻 = 終わった時刻から引くと始めた時刻）
   */
  | { type: "compact"; trigger: CompactTrigger; pre_tokens: number; post_tokens?: number; duration_ms?: number }
  /**
   * コンテキストを消去した（送信待ちのコンテキスト消去の行。チャットのセッションを外し、次の指示から新しい会話で始める。
   * これより前の作業の終わりからは、巻き戻し・子チャットで会話を引き継がない）
   */
  | { type: "context_cleared" }
  /** 同じチャットで担当 AI を替えた区切り。これより前には巻き戻し・分岐・ファイル復元ができない（0029）。 */
  | { type: "provider_switched"; from: ProviderId; to: ProviderId; handoff_attachments?: Attachment[]; queued_ids?: string[]; handoff_context?: string; handoff_status?: "ready" | "blocked" | "delivered" }
  /** サブエージェントの開始・終了（途中経過は保存せず、chat_subagent で届く） */
  | ({ type: "subagent" } & SubagentInfo)
  /** 子チャットの答えを親チャットに渡した（子チャットの記録。turn_event_id: どの作業の終わりの答えか。via: 渡し方。parent_chat_id: 渡した先） */
  | { type: "handoff"; via: HandoffVia; parent_chat_id: number; turn_event_id: number }
  /**
   * 作業場所を移した区切り（メモの仕様書「0025_チャットの作業場所を変える」）。from / to: 移す前と後の作業場所。reason: なぜ移ったか。
   * carried: コミットしていない変更を持っていった（Q2）。backed_up: ワークツリーを片付けたとき、コミットしていない変更を控えに入れた（J6）。
   * session_id / message_id: 移したあとの会話の起点（新しいセッションに写した、写せなければいまのセッションの、区切りの直前の最後まで終わった作業の終わり。
   * なければ省く）。区切りより前の発言へは巻き戻し・分岐ができず、起点を探すとき区切りを境目にする（H2）
   */
  | {
      type: "workplace_moved";
      from: WorkplaceRef;
      to: WorkplaceRef;
      reason: WorkplaceMoveReason;
      carried?: true;
      backed_up?: true;
      /** 元の作業場所で動いている内蔵ターミナル（止めずに残した。AI が移したとき = Q5） */
      running?: string[];
      /** 移した先で作業中だったほかのチャットの数（AI が移したとき = H6） */
      busy?: number;
      /** 先にこのチャットのワークツリーを片付けてから移した（AI の移す予約と片付けの予約が重なったとき = G4・J3） */
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
 * プロジェクトのフォルダを変えた（G1）
 */
export const WORKPLACE_MOVE_REASONS = ["user", "ai", "worktree_finished", "project_moved", "folder_moved"] as const;
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

/** 会話の圧縮のきっかけ（manual: 手で圧縮した（圧縮のボタン・/compact）/ auto: コンテキストが上限に近づいて Claude Code が自動で） */
export type CompactTrigger = "manual" | "auto";

/** サブエージェント（Task / Agent ツールで起動された別のエージェント）の状態 */
export interface SubagentInfo {
  task_id: string;
  /** 起動した Task / Agent ツールの呼び出し ID（タイムラインの呼び出しと結びつける） */
  tool_use_id?: string;
  description: string;
  subagent_type?: string;
  status: "running" | "completed" | "failed" | "stopped";
  tokens?: number;
  tool_uses?: number;
  duration_ms?: number;
  /** 直近に使ったツール（途中経過） */
  last_tool?: string;
  summary?: string;
}

/**
 * 実行中のコマンド（Bash。手前で待つものも裏で動かしたものも）の出力の終わりの部分（保存しない。chat_command_output で届く）。
 * 色の制御文字は除き、\r で上書きした行は最後の状態だけにしてある。終わったら届かなくなり、結果はツールの結果の記録で届く
 */
export interface CommandOutput {
  /** コマンドを実行した Bash の呼び出し ID（流れのツールの呼び出しと結びつける） */
  tool_use_id: string;
  /** Claude Code の作業 ID（裏で動いている作業の一覧と結びつける） */
  task_id: string;
  /** 出力の最後の行（COMMAND_OUTPUT_LINES 行まで） */
  text: string;
}

/** 実行中のコマンドの出力として画面に送る行数（最後の分） */
export const COMMAND_OUTPUT_LINES = 40;

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
