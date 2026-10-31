import type { KickoffTool } from "../kickoffTools.js";
import type { PhasePolicy } from "../phases.js";
import type {
  ApprovalDecision,
  ApprovalKind,
  EffortLevel,
  ModelOption,
  PermissionChoice,
  PlanUsage,
  ProviderId,
  ProviderStatus,
  RunEventData,
} from "../types.js";

/**
 * エージェント実行基盤の抽象化。
 * Claude Code（Agent SDK）を最初の実装とし、Codex / Gemini などは同じインターフェースで追加する。
 * 認証は各 CLI のログイン（claude / codex login など）をそのまま使い、アプリは資格情報を保持しない。
 */
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
  /** 1 ターン分（ユーザーの 1 メッセージに対する応答完了まで）を実行する */
  run(params: ProviderRunParams, callbacks: ProviderCallbacks, signal: AbortSignal): Promise<ProviderRunResult>;
}

export interface ProviderRunParams {
  cwd: string;
  prompt: string;
  /** プロバイダー既定のシステムプロンプトに追記する Kickoff の文脈 */
  systemPrompt: string;
  policy: PhasePolicy;
  /** 続きの会話の場合、前回のセッション ID */
  resumeSessionId: string | null;
  model: string | null;
  /** 推論の深さ（null ならフェーズのポリシーに従う） */
  effort: EffortLevel | null;
  /** 権限モード（"phase" ならフェーズのポリシーに従う） */
  permissionMode: PermissionChoice;
  /** ファストモード（対応していないモデル・プランでは通常の速度になる） */
  fastMode: boolean;
  /** 作業フォルダ以外に読み取りを許すフォルダ（添付ファイルの保存先など） */
  additionalDirectories: string[];
  tools: KickoffTool[];
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
export type AgentEvent = Exclude<RunEventData, { type: "user" | "approval" | "approval_resolved" | "result" }>;

export interface ProviderCallbacks {
  emit(event: AgentEvent): void;
  requestApproval(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalDecision>;
}

export interface ProviderRunResult {
  status: "completed" | "failed" | "cancelled";
  sessionId: string | null;
  result?: string;
  error?: string;
  /** API 換算の推定コスト（サブスクリプション利用時も参考値として記録） */
  costUsd?: number;
  turns?: number;
}
