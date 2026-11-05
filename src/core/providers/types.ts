import type { ChatPolicy } from "../chat/policy.js";
import type { ApiRetryInfo, ApprovalDecision, ApprovalKind, BackgroundState, EffortLevel, FileRewindResult, ModelOption, PermissionMode, PlanUsage, ProviderId, ProviderStatus, ChatEventData, CommandOutput, SlashCommandOption, SubagentInfo } from "@shared/types";

/**
 * エージェント実行基盤の抽象化。
 * Claude Code（Agent SDK）を最初の実装とし、Codex / Gemini などは同じインターフェースで追加する。
 * 認証は各 CLI のログイン（claude / codex login など）をそのまま使い、アプリは資格情報を保持しない。
 */
/** 1 回だけ聞くときのモデル（ask） */
export type AskModel = "haiku" | "sonnet";

export interface AgentProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** false の場合は UI に「未対応」と表示し、実行を受け付けない */
  readonly implemented: boolean;
  /** CLI のインストール・ログイン状態 */
  status(): Promise<ProviderStatus>;
  /** サブスクリプションの使用枠（対応していないプロバイダーは未実装でよい） */
  usage?(): Promise<PlanUsage>;
  /** チャット欄で選べるモデルの一覧 */
  models?(): Promise<ModelOption[]>;
  /** チャット欄の / で出すコマンド（cwd のプロジェクトのコマンド・スキルも含む） */
  commands?(cwd: string): Promise<SlashCommandOption[]>;
  /** 最初のメッセージから短いチャット名を作る */
  title?(text: string): Promise<string>;
  /** あとで読み返すメモにするため、文を短くまとめる（チャットの文を「AI で要約してメモに追加」） */
  summarize?(text: string): Promise<string>;
  /**
   * ツールを使わずに 1 回だけ聞いて、答えの文を返す（メモの AI の整理。チャットの記録には残さない）。
   * model: 軽い問い合わせは haiku（既定）、文を書き直すなど質が要るものは sonnet
   */
  ask?(prompt: string, options?: { model?: AskModel }): Promise<string>;
  /** 会話を messageId の位置までで分けた、新しいセッションを作る（ここから分岐。対応していなければ未実装） */
  fork?(sessionId: string, messageId: string, cwd: string): Promise<string>;
  /** ファイルを、その会話の自分の発言（messageId）を送る前の状態に戻す（dryRun なら戻さずに、変わる量だけを返す）。作業中でないときに呼ぶ */
  rewindFiles?(sessionId: string, messageId: string, cwd: string, dryRun: boolean): Promise<FileRewindResult>;
  /** 1 ターン分（ユーザーの 1 メッセージに対する応答完了まで）を実行する */
  run(params: ProviderTurnParams, callbacks: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult>;
}

export interface ProviderTurnParams {
  cwd: string;
  prompt: string;
  /** 指示の ID（自分の発言の記録の message_uuid。ファイルをこの発言の時点に戻すときの目印） */
  promptId?: string;
  /** プロバイダー既定のシステムプロンプトに追記する Kickoff の文脈 */
  systemPrompt: string;
  policy: ChatPolicy;
  /** 続きの会話の場合、前回のセッション ID */
  resumeSessionId: string | null;
  model: string | null;
  /** 推論の深さ（null なら指定しない＝SDK とモデルの既定） */
  effort: EffortLevel | null;
  /** 権限モード（ファイルの編集を自動で承認するかも、これで決まる） */
  permissionMode: PermissionMode;
  /** ファストモード（対応していないモデル・プランでは通常の速度になる） */
  fastMode: boolean;
  /** 自動圧縮を始めるコンテキストの使用率（%。null なら指定しない＝ Claude Code の既定） */
  autoCompactPct: number | null;
  /** 作業フォルダ以外に読み取りを許すフォルダ（添付ファイルの保存先・参照資料など） */
  additionalDirectories: string[];
  /** 読むだけで書き込ませないパス（リポジトリの外の参照資料） */
  readOnlyPaths?: string[];
}

export interface ApprovalRequest {
  kind: ApprovalKind;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
  description?: string;
  canRemember: boolean;
}

/** プロバイダーから Kickoff へ通知する実行中イベント（DB にはこの形のまま保存される） */
type AgentEvent = Exclude<ChatEventData, { type: "user" | "approval" | "approval_resolved" | "result" }>;

/** 作業中のチャットへの操作（ストリーミング入力が開いている間だけ） */
export interface TurnControl {
  /** 作業を止めずに発言を足す（いまの手順の切れ目でメインのエージェントが読む）。入力が閉じていれば false */
  tell(text: string, uuid?: string): boolean;
  /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド） */
  stopTask(taskId: string): Promise<void>;
}

export interface ProviderCallbacks {
  emit(event: AgentEvent): void;
  /** 返答の文字を生成されたそばから渡す（画面のストリーミング表示用。保存しない） */
  stream?(text: string): void;
  /** サブエージェントの途中経過（保存しない） */
  subagentProgress?(info: SubagentInfo): void;
  /** 実行中のコマンドの出力の終わりの部分（増えたときだけ。保存しない） */
  commandOutput?(output: CommandOutput): void;
  requestApproval(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalDecision>;
  /** AI の API への通信を再試行しているところ（通信が切れたときなど）。返答が届き始めたら null（保存しない） */
  retry?(info: ApiRetryInfo | null): void;
  /** 裏で動いている作業・メインの返答が終わったかが変わったとき（保存しない） */
  background?(state: BackgroundState): void;
  /** 会話を圧縮（要約）し始めた・終わった（手で圧縮したときも、上限に近づいて自動で圧縮されたときも。保存しない） */
  compacting?(active: boolean): void;
  /**
   * 会話の圧縮に失敗した（理由。分からなければ null）。知らせるかはコアが決める（手で圧縮したときだけお知らせに残す。
   * 自動の圧縮の失敗は、要約するものがない（too_few_groups）なども含むので Claude Code も知らせない）
   */
  compactFailed?(reason: string | null): void;
  /** 作業中のチャットへの操作を渡す（終わったら null） */
  control?(control: TurnControl | null): void;
}

export interface ProviderTurnResult {
  status: "completed" | "failed" | "cancelled";
  sessionId: string | null;
  result?: string;
  error?: string;
  /** API 換算の推定コスト（サブスクリプション利用時も参考値として記録） */
  costUsd?: number;
  turns?: number;
  /** 最後の応答の時点で、コンテキストウィンドウに入っているトークン数とその上限 */
  context?: { tokens: number; window: number | null };
  /** メインの会話の最後のメッセージの ID（ここから分岐するときの位置） */
  lastMessageId?: string;
  /** 失敗が通信の切断によるものか（つながったら自動で再開する） */
  network?: boolean;
  /** 使用枠の上限で止まった（resetsAt: 枠が戻る時刻。Claude Code が知らせたときだけ） */
  usageLimit?: { resetsAt: string | null };
}
