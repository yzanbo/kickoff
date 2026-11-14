// 1 つの本体（Mac の Kickoff）への API。端末のトークンを Authorization: Bearer で送り、版の見出しで自分の API の版を伝える。
// 失敗は ApiError（状態と印 code。mobile_off・device_read_only・client_too_old など）で投げ、画面が文を出し分ける
import type {
  Approval,
  ApprovalDecision,
  Chat,
  ChatDetail,
  ChatDetailQuery,
  Device,
  DevicePush,
  Project,
  QueueState,
  SendMessageBody,
  ServerStatus,
  TellResult,
  TerminalCreated,
  TerminalTab,
  ViewingBody,
} from "@shared/types";
import { API_VERSION_HEADER } from "@shared/api/version";
import { APP_API_VERSION } from "./version";

/** 本体が断ったとき（code は本体の印。なければ null） */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

/** 本体への道（Tailscale Serve の https の URL と、この本体の端末のトークン） */
export interface HostAccess {
  url: string;
  token: string;
}

/** クエリを付ける（undefined は付けない） */
export function withQuery(path: string, query: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v));
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

/** 頼みに付ける見出し（トークンと API の版） */
export const authHeaders = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}`, [API_VERSION_HEADER]: String(APP_API_VERSION) });

export class HostClient {
  constructor(
    readonly access: HostAccess,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchFn(`${this.access.url}${path}`, {
      ...init,
      method,
      headers: { ...authHeaders(this.access.token), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
    if (!res.ok) throw new ApiError(res.status, json?.error ?? `本体が ${res.status} を返しました`, json?.code ?? null);
    return json as T;
  }

  status = () => this.request<ServerStatus>("GET", "/api/status");
  self = () => this.request<Device>("GET", "/api/devices/self");
  setPush = (push: DevicePush | null) => this.request<void>("PUT", "/api/devices/self/push", { push });
  reportViewing = (view: ViewingBody) => this.request<void>("PUT", "/api/viewing", view);

  projects = () => this.request<Project[]>("GET", "/api/projects");
  chats = (projectId: number) => this.request<Chat[]>("GET", `/api/projects/${projectId}/chats`);
  chatDetail = (id: number, query: ChatDetailQuery = {}) => this.request<ChatDetail>("GET", withQuery(`/api/chats/${id}`, { ...query }));
  markSeen = (chatId: number) => this.request<Chat>("POST", `/api/chats/${chatId}/seen`);
  startChat = (projectId: number, text: string) => this.request<Chat>("POST", `/api/projects/${projectId}/chats`, { text });
  send = (chatId: number, text: string) => this.request<Chat>("POST", `/api/chats/${chatId}/messages`, { text } satisfies SendMessageBody);
  /** 作業中なら止めずに伝える（作業していなければ送る） */
  tell = (chatId: number, text: string) => this.request<TellResult>("POST", `/api/chats/${chatId}/tell`, { text } satisfies SendMessageBody);
  cancel = (chatId: number) => this.request<void>("POST", `/api/chats/${chatId}/cancel`);
  queue = (chatId: number, text: string) => this.request<QueueState>("POST", `/api/chats/${chatId}/queue`, { text });
  removeQueued = (chatId: number, queueId: string) => this.request<QueueState>("DELETE", `/api/chats/${chatId}/queue/${encodeURIComponent(queueId)}`);

  approvals = () => this.request<Approval[]>("GET", "/api/approvals");
  resolveApproval = (id: string, decision: ApprovalDecision) => this.request<void>("POST", `/api/approvals/${encodeURIComponent(id)}`, decision);

  terminals = (projectId: number) => this.request<TerminalTab[]>("GET", withQuery("/api/terminals", { project_id: projectId }));
  startTerminal = (projectId: number, cols: number, rows: number) => this.request<TerminalCreated>("POST", `/api/projects/${projectId}/terminals`, { worktree_path: null, cols, rows });
  closeTerminal = (key: string) => this.request<void>("DELETE", `/api/terminals/${encodeURIComponent(key)}`);
  /** ターミナルの WebSocket の URL（見出しはつなぐときに authHeaders で付ける） */
  terminalSocketUrl = (key: string, cols: number, rows: number) =>
    withQuery(`${this.access.url.replace(/^http/, "ws")}/api/terminals/${encodeURIComponent(key)}/ws`, { cols, rows });
}
