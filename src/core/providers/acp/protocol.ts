/**
 * ACP（Agent Client Protocol。JSON-RPC 2.0 を標準入出力に 1 行 1 つ）のうち Kickoff が使う分だけの型（メモの仕様書「0021」の段階 5）。
 * 公式の schema（@agentclientprotocol/sdk 2.7.0 の schema/v1/schema.json。プロトコルの版 1）から手で写した（依存には足さない）。
 * 版が上がったら schema を見比べる
 */

export const ACP_PROTOCOL_VERSION = 1;

export interface InitializeResponse {
  protocolVersion: number;
  agentCapabilities?: AgentCapabilities;
  authMethods?: AuthMethod[];
  agentInfo?: { name: string; title?: string | null; version: string } | null;
}

export interface AgentCapabilities {
  loadSession?: boolean;
  promptCapabilities?: { image?: boolean; audio?: boolean; embeddedContext?: boolean };
  mcpCapabilities?: { http?: boolean; sse?: boolean };
  sessionCapabilities?: {
    list?: object | null;
    delete?: object | null;
    resume?: object | null;
    close?: object | null;
    additionalDirectories?: object | null;
    systemPrompt?: { mode?: object | null } | null;
  };
}

interface AuthMethod {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
}

export type ContentBlock = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string } | { type: "resource_link"; uri: string; name: string } | { type: string; [key: string]: unknown };

export interface McpServerHttp {
  type: "http";
  name: string;
  url: string;
  headers: { name: string; value: string }[];
}

export interface SessionMode {
  id: string;
  name: string;
  description?: string | null;
}

export interface SessionConfigOption {
  id: string;
  name: string;
  category?: string | null;
  type: string;
  currentValue?: unknown;
  options?: ({ value: string; name: string } | { group: string; name: string; options: { value: string; name: string }[] })[];
}

/** session/new・session/load・session/resume の答え */
export interface SessionResponse {
  sessionId?: string;
  modes?: { currentModeId: string; availableModes: SessionMode[] } | null;
  configOptions?: SessionConfigOption[] | null;
}

export interface SessionRequestBase {
  cwd: string;
  mcpServers: McpServerHttp[];
  additionalDirectories?: string[];
  systemPrompt?: { mode: "append"; content: ContentBlock[] } | null;
}

export type StopReason = "end_turn" | "max_tokens" | "max_turn_requests" | "refusal" | "cancelled" | string;

type ToolKind = "read" | "edit" | "delete" | "move" | "search" | "execute" | "think" | "fetch" | "switch_mode" | "other";
type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";

export type ToolCallContent =
  | { type: "content"; content: ContentBlock }
  | { type: "diff"; path: string; oldText?: string | null; newText: string }
  | { type: "terminal"; terminalId: string };

/** ツールの呼び出し（tool_call は全体、tool_call_update は変わった欄だけ） */
export interface ToolCall {
  toolCallId: string;
  title?: string | null;
  name?: string | null;
  kind?: ToolKind | null;
  status?: ToolCallStatus | null;
  content?: ToolCallContent[] | null;
  locations?: { path: string; line?: number | null }[] | null;
  rawInput?: unknown;
  rawOutput?: unknown;
}

type SessionUpdate =
  | { sessionUpdate: "user_message_chunk"; content: ContentBlock }
  | { sessionUpdate: "agent_message_chunk"; content: ContentBlock; messageId?: string | null }
  | { sessionUpdate: "agent_thought_chunk"; content: ContentBlock; messageId?: string | null }
  | ({ sessionUpdate: "tool_call" } & ToolCall)
  | ({ sessionUpdate: "tool_call_update" } & ToolCall)
  | { sessionUpdate: "usage_update"; used: number; size: number; cost?: { amount: number; currency: string } | null }
  | { sessionUpdate: "compaction_update"; compactionId: string; status: string; error?: string | null }
  | { sessionUpdate: "current_mode_update"; currentModeId: string }
  | { sessionUpdate: "notice"; severity: string; title: string; description?: string | null }
  | { sessionUpdate: string; [key: string]: unknown };

export interface SessionNotification {
  sessionId: string;
  update: SessionUpdate;
}

export type PermissionOptionKind = "allow_once" | "allow_always" | "reject_once" | "reject_always";

export interface RequestPermissionRequest {
  sessionId: string;
  toolCall: ToolCall;
  options: { optionId: string; name: string; kind: PermissionOptionKind }[];
}

export type RequestPermissionResponse = { outcome: { outcome: "cancelled" } | { outcome: "selected"; optionId: string } };
