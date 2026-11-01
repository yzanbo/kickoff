import { useEffect, useRef, useState } from "react";
import type {
  AppSettings,
  BoardStage,
  Attachment,
  Approval,
  ApprovalDecision,
  Artifact,
  ModelOption,
  ProviderId,
  Run,
  RunEvent,
  RunGroup,
  RunOptions,
  SearchHit,
  ServerStatus,
  Task,
  BusEvent,
  GitHubStatus,
  PlanUsage,
  Project,
  ProjectSummary,
  Phase,
  ProviderStatus,
  WorkspaceInspection,
} from "../../core/types";

export interface NewProjectInput {
  name: string;
  idea: string;
  parent_dir: string;
  folder_name: string;
}

export interface TaskInput {
  phase: Phase;
  title: string;
  description: string;
  acceptance_criteria: string;
  priority: number;
}

export interface RunDetail {
  run: Run;
  events: RunEvent[];
  approvals: Approval[];
}

export interface ImportProjectInput {
  path: string;
  name: string;
  description: string;
  init_git: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  settings: () => request<AppSettings>("GET", "/api/settings"),
  updateSettings: (patch: Partial<AppSettings>) => request<AppSettings>("PUT", "/api/settings", patch),
  providers: () => request<ProviderStatus[]>("GET", "/api/providers"),
  github: () => request<GitHubStatus>("GET", "/api/github"),
  status: () => request<ServerStatus>("GET", "/api/status"),
  usage: () => request<PlanUsage>("GET", "/api/usage"),
  refreshUsage: () => request<PlanUsage>("POST", "/api/usage/refresh"),
  projects: () => request<ProjectSummary[]>("GET", "/api/projects"),
  project: (id: number) => request<Project>("GET", `/api/projects/${id}`),
  createProject: (input: NewProjectInput) => request<Project>("POST", "/api/projects", input),
  importProject: (input: ImportProjectInput) => request<Project>("POST", "/api/projects/import", input),
  inspectWorkspace: (path: string) =>
    request<WorkspaceInspection>("GET", `/api/workspace/inspect?path=${encodeURIComponent(path)}`),
  updateProject: (
    id: number,
    patch: Partial<Pick<Project, "name" | "description" | "test_command" | "deploy_instructions" | "write_scopes" | "defaults">>,
  ) =>
    request<Project>("PATCH", `/api/projects/${id}`, patch),
  deleteProject: (id: number) => request<{ ok: true }>("DELETE", `/api/projects/${id}`),
  models: (provider: ProviderId) => request<ModelOption[]>("GET", `/api/providers/${provider}/models`),

  // タスク
  tasks: (projectId: number) => request<Task[]>("GET", `/api/projects/${projectId}/tasks`),
  createTask: (projectId: number, input: TaskInput) => request<Task>("POST", `/api/projects/${projectId}/tasks`, input),
  updateTask: (id: number, patch: Partial<TaskInput & { status: Task["status"] }>) =>
    request<Task>("PATCH", `/api/tasks/${id}`, patch),
  deleteTask: (id: number) => request<{ ok: true }>("DELETE", `/api/tasks/${id}`),

  // 成果物
  artifacts: (projectId: number) => request<Artifact[]>("GET", `/api/projects/${projectId}/artifacts`),

  // 実行（エージェントとの会話）
  runs: (projectId: number) => request<Run[]>("GET", `/api/projects/${projectId}/runs`),
  allRuns: () => request<Run[]>("GET", "/api/runs?limit=300"),
  search: (q: string, scope: { projectId?: number; runId?: number } = {}) => {
    const params = new URLSearchParams({ q });
    if (scope.projectId !== undefined) params.set("project_id", String(scope.projectId));
    if (scope.runId !== undefined) params.set("run_id", String(scope.runId));
    return request<SearchHit[]>("GET", `/api/search?${params}`);
  },
  startRun: (
    projectId: number,
    input: { phase: Phase; prompt: string; task_id?: number; options: RunOptions; attachments?: Attachment[]; stage?: BoardStage },
  ) => request<Run>("POST", `/api/projects/${projectId}/runs`, input),
  run: (id: number) => request<RunDetail>("GET", `/api/runs/${id}`),
  sendMessage: (runId: number, text: string, options: RunOptions, attachments: Attachment[] = []) =>
    request<Run>("POST", `/api/runs/${runId}/messages`, { text, options, attachments }),

  /** 添付ファイルをアップロードする */
  upload: async (file: File): Promise<Attachment> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: form, credentials: "same-origin" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
    }
    const [saved] = (await res.json()) as Attachment[];
    return saved;
  },
  renameRun: (runId: number, title: string) => request<Run>("PATCH", `/api/runs/${runId}`, { title }),
  moveRun: (runId: number, stage: BoardStage) => request<Run>("PATCH", `/api/runs/${runId}`, { stage }),
  markSeen: (runId: number) => request<Run>("POST", `/api/runs/${runId}/seen`),
  archiveRun: (runId: number, archived = true) => request<Run>("POST", `/api/runs/${runId}/archive`, { archived }),
  deleteRun: (runId: number) => request<{ ok: true }>("DELETE", `/api/runs/${runId}`),
  setRunGroup: (runId: number, groupId: number | null) => request<Run>("PATCH", `/api/runs/${runId}`, { group_id: groupId }),
  groups: (projectId: number) => request<RunGroup[]>("GET", `/api/projects/${projectId}/groups`),
  createGroup: (projectId: number, name: string) => request<RunGroup>("POST", `/api/projects/${projectId}/groups`, { name }),
  renameGroup: (groupId: number, name: string) => request<RunGroup>("PATCH", `/api/groups/${groupId}`, { name }),
  reorderGroups: (projectId: number, ids: number[]) => request<RunGroup[]>("PUT", `/api/projects/${projectId}/groups/order`, { ids }),
  deleteGroup: (groupId: number) => request<{ ok: true }>("DELETE", `/api/groups/${groupId}`),
  cancelRun: (runId: number) => request<{ ok: true }>("POST", `/api/runs/${runId}/cancel`),

  // 承認依頼・質問
  approvals: () => request<Approval[]>("GET", "/api/approvals"),
  resolveApproval: (id: string, decision: ApprovalDecision) =>
    request<{ ok: true }>("POST", `/api/approvals/${id}`, decision),
};

export type ConnectionState = "connecting" | "open" | "closed";

/** サーバーからのイベント（SSE）を購読する。切断時は EventSource が自動で再接続する */
/** サーバーからのイベントを受け取る。state は接続の状態、since は最後につながった時刻 */
export function useServerEvents(onEvent: (event: BusEvent) => void): { state: ConnectionState; since: number | null } {
  const [state, setState] = useState<ConnectionState>("connecting");
  const [since, setSince] = useState<number | null>(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const connect = () => {
      source = new EventSource("/api/events");
      source.onopen = () => {
        setState("open");
        setSince(Date.now());
      };
      source.onerror = () => {
        if (source?.readyState !== EventSource.CLOSED) return setState("connecting");
        // 自動再接続されない切断（認証エラーなど）は、こちらで張り直す
        setState("closed");
        if (!closed) retry = setTimeout(connect, 5000);
      };
      source.onmessage = (e) => {
        try {
          handler.current(JSON.parse(e.data) as BusEvent);
        } catch {
          // 不正なイベントは無視
        }
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      source?.close();
    };
  }, []);

  return { state, since };
}

/** 非同期の読み込み状態をまとめて扱う */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((d) => alive && (setData(d), setError(undefined)))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, setData, error, loading, reload: () => setNonce((n) => n + 1) };
}

/** 添付ファイルを画面で開く・表示するための URL */
export function attachmentUrl(a: Attachment): string {
  return `/api/uploads/${a.id}?mime=${encodeURIComponent(a.mime)}`;
}
