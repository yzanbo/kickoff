/**
 * Codex の app-server（`codex app-server`。改行区切りの JSON-RPC。"jsonrpc" の欄は付けない）のやり取りのうち、Kickoff が使う分だけの型。
 * 確かめた版: codex-cli 0.172.0（`codex app-server generate-ts` の出力の v2 から手で写した。生成物はリポジトリに入れない）。
 * 版が上がって形が変わったら、生成し直して見比べ、ここを直す
 */

/** 確かめた codex-cli の版（上の型を写した版） */
export const TESTED_VERSION = "0.172.0";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** 指示の 1 つ分（文だけを使う。画像などは添付のパスを文に書いて Read させるので使わない） */
export interface TextInput {
  type: "text";
  text: string;
  text_elements: [];
}

/** 承認を聞く決まり（Kickoff は on-request にして、守りは PreToolUse のフックで当てる） */
type AskForApproval = "untrusted" | "on-request" | "never";
type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type SandboxPolicy =
  | { type: "dangerFullAccess" }
  | { type: "readOnly"; networkAccess: boolean }
  | { type: "workspaceWrite"; writableRoots: string[]; networkAccess: boolean; excludeTmpdirEnvVar: boolean; excludeSlashTmp: boolean };

/** thread/start・thread/resume・thread/fork に共通で渡す上書き */
export interface ThreadOverrides {
  model?: string | null;
  cwd?: string | null;
  approvalPolicy?: AskForApproval | null;
  sandbox?: SandboxMode | null;
  /** config.toml の上書き（キーは config.toml の書き方の点区切り。mcp_servers.<名前> など） */
  config?: Record<string, JsonValue> | null;
  developerInstructions?: string | null;
}

export interface ThreadStartParams extends ThreadOverrides {
  ephemeral?: boolean | null;
}
export interface ThreadResumeParams extends ThreadOverrides {
  threadId: string;
  excludeTurns?: boolean;
}
export interface ThreadForkParams extends ThreadOverrides {
  threadId: string;
  /** ここまでのターンを写す（そのターンを含む） */
  lastTurnId?: string | null;
  excludeTurns?: boolean;
}
export interface ThreadResponse {
  thread: { id: string };
  model: string;
}

export interface TurnStartParams {
  threadId: string;
  input: TextInput[];
  clientUserMessageId?: string | null;
  cwd?: string | null;
  approvalPolicy?: AskForApproval | null;
  sandboxPolicy?: SandboxPolicy | null;
  model?: string | null;
  effort?: string | null;
}
export interface TurnSteerParams {
  threadId: string;
  input: TextInput[];
  clientUserMessageId?: string | null;
  expectedTurnId: string;
}

type TurnStatus = "completed" | "interrupted" | "failed" | "inProgress";

/** 失敗の種類（文字か、HTTP の状態を持つ形）。通信の切断・使用枠の上限の見分けに使う */
export type CodexErrorInfo = string | Record<string, { httpStatusCode?: number | null } | null>;
export interface TurnError {
  message: string;
  codexErrorInfo: CodexErrorInfo | null;
  additionalDetails: string | null;
}
export interface Turn {
  id: string;
  status: TurnStatus;
  error: TurnError | null;
}

export interface FileUpdateChange {
  path: string;
  kind: { type: "add" } | { type: "delete" } | { type: "update"; move_path: string | null };
  diff: string;
}

/** 会話の項目（使う種類だけ。ほかは type だけを見て読み飛ばす） */
export type ThreadItem = { startedAtMs?: number | null; completedAtMs?: number | null } & (
  | { type: "userMessage"; id: string }
  | { type: "agentMessage"; id: string; text: string }
  | { type: "reasoning"; id: string; summary: string[]; content: string[] }
  | { type: "commandExecution"; id: string; command: string; cwd: string; aggregatedOutput: string | null; exitCode: number | null; status: string }
  | { type: "fileChange"; id: string; changes: FileUpdateChange[]; status: string }
  | {
      type: "mcpToolCall";
      id: string;
      server: string;
      tool: string;
      arguments: JsonValue;
      status: string;
      result: { content: JsonValue[] } | null;
      error: { message: string } | null;
    }
  | { type: "webSearch"; id: string; query?: string }
  | { type: "contextCompaction"; id: string }
  | { type: string; id: string }
);

interface TokenUsageBreakdown {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
}
export interface ThreadTokenUsage {
  total: TokenUsageBreakdown;
  last: TokenUsageBreakdown;
  modelContextWindow: number | null;
}

/** 承認の答え（コマンド・ファイルの変更）。理由を渡す欄はないので、断った理由は turn/steer で伝える */
export type ApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export interface CommandApprovalParams {
  threadId: string;
  turnId: string;
  itemId: string;
  reason?: string | null;
  command?: string | null;
  cwd?: string | null;
}
export interface FileChangeApprovalParams {
  threadId: string;
  turnId: string;
  itemId: string;
  reason?: string | null;
  grantRoot?: string | null;
}
export interface PermissionsApprovalParams {
  threadId: string;
  turnId: string;
  itemId: string;
  cwd: string;
  reason: string | null;
  permissions: { network: { enabled: boolean | null } | null; fileSystem: { read: string[] | null; write: string[] | null } | null };
}
interface UserInputQuestion {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: { label: string; description: string }[] | null;
}
export interface UserInputParams {
  threadId: string;
  turnId: string;
  itemId: string;
  questions: UserInputQuestion[];
}
export interface ElicitationParams {
  threadId: string;
  turnId: string | null;
  serverName: string;
  mode: string;
  message: string;
}

/** 使用枠（account/rateLimits/read） */
export interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}
/** クレジット（上限を超えたあとに引く。残りは数の文字） */
interface CreditsSnapshot {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string | null;
}
export interface RateLimitSnapshot {
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  planType: string | null;
  credits?: CreditsSnapshot | null;
}
/** 実行中の使用枠の知らせ（account/rateLimits/updated。分からない項目は null で、前の値を消さない） */
export interface RateLimitsUpdatedNotification {
  rateLimits: RateLimitSnapshot;
}

/** モデルの一覧（model/list） */
export interface CodexModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[];
  defaultReasoningEffort: string;
  isDefault: boolean;
}
export interface ModelListResponse {
  data: CodexModel[];
  nextCursor: string | null;
}

/** アカウント（account/read） */
export interface AccountResponse {
  account: { type: "apiKey" } | { type: "chatgpt"; email: string | null; planType: string } | { type: string } | null;
  requiresOpenaiAuth: boolean;
}

/** ログインを始める（account/login/start。Sign in with ChatGPT は chatgpt。Codex がブラウザの OAuth と戻り先を受け、資格情報を自分の置き場に書く） */
export type LoginStartParams = { type: "chatgpt" } | { type: "chatgptDeviceCode" };
export type LoginStartResponse =
  | { type: "chatgpt"; loginId: string; authUrl: string }
  | { type: "chatgptDeviceCode"; loginId: string; verificationUrl: string; userCode: string }
  | { type: string };
