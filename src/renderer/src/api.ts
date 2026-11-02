import type {
  AppSettings,
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
  FileContent,
  GitCommitDetail,
  GitDiff,
  GitFileChange,
  GitLog,
  GitRefs,
  GitWorktree,
  GitHubStatus,
  GitStatus,
  PlanUsage,
  ServiceUsage,
  SlashCommandOption,
  Project,
  ProjectFiles,
  PullRequestInfo,
  ProjectSearchQuery,
  ProjectSearchResult,
  ProjectSummary,
  Phase,
  ProviderStatus,
  WorkspaceInspection,
} from "../../core/types";

interface NewProjectInput {
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

interface RunDetail {
  run: Run;
  events: RunEvent[];
  approvals: Approval[];
}

interface ImportProjectInput {
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

/** Git・ファイル・検索の操作先（プロジェクトの番号だけなら本体。worktree があればそのワークツリー） */
export type GitTarget = number | { projectId: number; worktree?: string };

function gitUrl(target: GitTarget, path: string, params: Record<string, string> = {}) {
  const { projectId, worktree } = typeof target === "number" ? { projectId: target, worktree: undefined } : target;
  const query = new URLSearchParams({ ...params, ...(worktree ? { worktree } : {}) }).toString();
  return `/api/projects/${projectId}${path}${query ? `?${query}` : ""}`;
}

export const api = {
  settings: () => request<AppSettings>("GET", "/api/settings"),
  updateSettings: (patch: Partial<AppSettings>) => request<AppSettings>("PUT", "/api/settings", patch),
  providers: () => request<ProviderStatus[]>("GET", "/api/providers"),
  github: () => request<GitHubStatus>("GET", "/api/github"),
  status: () => request<ServerStatus>("GET", "/api/status"),
  usage: () => request<PlanUsage>("GET", "/api/usage"),
  refreshUsage: () => request<PlanUsage>("POST", "/api/usage/refresh"),
  /** サービスごとの使用状況（設定の「使用状況」） */
  usageServices: () => request<ServiceUsage[]>("GET", "/api/usage/services"),
  refreshUsageServices: () => request<ServiceUsage[]>("POST", "/api/usage/services/refresh"),
  projects: () => request<ProjectSummary[]>("GET", "/api/projects"),
  project: (id: number) => request<Project>("GET", `/api/projects/${id}`),
  createProject: (input: NewProjectInput) => request<Project>("POST", "/api/projects", input),
  importProject: (input: ImportProjectInput) => request<Project>("POST", "/api/projects/import", input),
  inspectWorkspace: (path: string) =>
    request<WorkspaceInspection>("GET", `/api/workspace/inspect?path=${encodeURIComponent(path)}`),
  updateProject: (
    id: number,
    patch: Partial<
      Pick<
        Project,
        "name" | "description" | "provider" | "test_command" | "deploy_instructions" | "defaults" | "references" | "hue"
      >
    > & { pinned?: boolean; archived?: boolean },
  ) =>
    request<Project>("PATCH", `/api/projects/${id}`, patch),
  deleteProject: (id: number) => request<{ ok: true }>("DELETE", `/api/projects/${id}`),
  reorderProjects: (ids: number[]) => request<{ ok: true }>("PUT", "/api/projects/order", { ids }),
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
  /** archived: アーカイブしたチャットも含める */
  runs: (projectId: number, opts: { archived?: boolean } = {}) =>
    request<Run[]>("GET", `/api/projects/${projectId}/runs${opts.archived ? "?archived=1" : ""}`),
  allRuns: (opts: { archived?: boolean } = {}) => request<Run[]>("GET", `/api/runs?limit=300${opts.archived ? "&archived=1" : ""}`),
  search: (q: string, scope: { projectId?: number; runId?: number } = {}) => {
    const params = new URLSearchParams({ q });
    if (scope.projectId !== undefined) params.set("project_id", String(scope.projectId));
    if (scope.runId !== undefined) params.set("run_id", String(scope.runId));
    return request<SearchHit[]>("GET", `/api/search?${params}`);
  },
  startRun: (
    projectId: number,
    input: {
      phase: Phase;
      prompt: string;
      task_id?: number;
      options: RunOptions;
      attachments?: Attachment[];
      group_id?: number;
      /** 作業場所: いまあるワークツリーのフォルダ、または新しく作るワークツリーのブランチ名（どちらもなければ本体） */
      worktree_path?: string;
      new_worktree_branch?: string;
    },
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
  markSeen: (runId: number) => request<Run>("POST", `/api/runs/${runId}/seen`),
  markUnseen: (runId: number) => request<Run>("POST", `/api/runs/${runId}/unseen`),
  pinRun: (runId: number, pinned: boolean) => request<Run>("POST", `/api/runs/${runId}/pin`, { pinned }),
  compactRun: (runId: number) => request<Run>("POST", `/api/runs/${runId}/compact`),
  archiveRun: (runId: number, archived = true) => request<Run>("POST", `/api/runs/${runId}/archive`, { archived }),
  deleteRun: (runId: number) => request<{ ok: true }>("DELETE", `/api/runs/${runId}`),
  setRunGroup: (runId: number, groupId: number | null) => request<Run>("PATCH", `/api/runs/${runId}`, { group_id: groupId }),
  groups: (projectId: number) => request<RunGroup[]>("GET", `/api/projects/${projectId}/groups`),
  createGroup: (projectId: number, name: string) => request<RunGroup>("POST", `/api/projects/${projectId}/groups`, { name }),
  renameGroup: (groupId: number, name: string) => request<RunGroup>("PATCH", `/api/groups/${groupId}`, { name }),
  reorderGroups: (projectId: number, ids: number[]) => request<RunGroup[]>("PUT", `/api/projects/${projectId}/groups/order`, { ids }),
  gitStatus: (target: GitTarget) => request<GitStatus>("GET", gitUrl(target, "/git/status")),
  /** ステージ・ステージの取り消し・変更を元に戻す（終わったあとの状態を返す） */
  gitAction: (target: GitTarget, action: "stage" | "unstage" | "discard", paths: string[]) =>
    request<GitStatus>("POST", gitUrl(target, `/git/${action}`), { paths }),
  gitCommit: (target: GitTarget, message: string) => request<GitStatus>("POST", gitUrl(target, "/git/commit"), { message }),
  gitPush: (target: GitTarget) => request<GitStatus>("POST", gitUrl(target, "/git/push")),
  gitPull: (target: GitTarget) => request<GitStatus>("POST", gitUrl(target, "/git/pull")),
  gitFetch: (target: GitTarget) => request<GitStatus>("POST", gitUrl(target, "/git/fetch")),
  /** 作業場所のブランチの PR（なければ null）と、PR を作る（まだプッシュしていなければ先にプッシュする） */
  pullRequest: (target: GitTarget) => request<PullRequestInfo | null>("GET", gitUrl(target, "/git/pr")),
  createPullRequest: (target: GitTarget) => request<PullRequestInfo>("POST", gitUrl(target, "/git/pr")),
  /** PR がマージされたワークツリーを片付ける（ワークツリーと手元のブランチを消す） */
  finishWorktree: (projectId: number, path: string) => request<GitWorktree[]>("POST", `/api/projects/${projectId}/git/worktrees/finish`, { path }),
  gitLog: (target: GitTarget, skip = 0) => request<GitLog>("GET", gitUrl(target, "/git/log", { skip: String(skip) })),
  gitRefs: (target: GitTarget) => request<GitRefs>("GET", gitUrl(target, "/git/refs")),
  gitWorktrees: (projectId: number) => request<GitWorktree[]>("GET", `/api/projects/${projectId}/git/worktrees`),
  addWorktree: (projectId: number, branch: string) => request<GitWorktree[]>("POST", `/api/projects/${projectId}/git/worktrees`, { branch }),
  removeWorktree: (projectId: number, path: string, force = false) =>
    request<GitWorktree[]>("POST", `/api/projects/${projectId}/git/worktrees/remove`, { path, force }),
  gitCommitDetail: (target: GitTarget, hash: string) => request<GitCommitDetail>("GET", gitUrl(target, `/git/commits/${hash}`)),
  gitCommitDiff: (target: GitTarget, hash: string, file: GitFileChange) =>
    request<GitDiff>("GET", gitUrl(target, `/git/commits/${hash}/diff`, { path: file.path, ...(file.old_path ? { old: file.old_path } : {}) })),
  projectFiles: (target: GitTarget) => request<ProjectFiles>("GET", gitUrl(target, "/files")),
  /** チャット欄の / で出すコマンド（作業場所のプロジェクトのコマンド・スキルも含む） */
  slashCommands: (target: GitTarget) => request<SlashCommandOption[]>("GET", gitUrl(target, "/commands")),
  /** ファイルを保存する（baseHash は開いたときの指紋。ほかで変わっていれば 409。null なら上書き） */
  saveProjectFile: (target: GitTarget, path: string, content: string, baseHash: string | null) =>
    request<{ hash: string }>("PUT", gitUrl(target, "/file"), { path, content, base_hash: baseHash }),
  searchProject: (target: GitTarget, { query, caseSensitive, wholeWord, regex }: ProjectSearchQuery) =>
    request<ProjectSearchResult>(
      "GET",
      gitUrl(target, "/search", { q: query, case: caseSensitive ? "1" : "0", word: wholeWord ? "1" : "0", regex: regex ? "1" : "0" }),
    ),
  projectFile: (target: GitTarget, path: string) => request<FileContent>("GET", gitUrl(target, "/file", { path })),
  gitDiff: (target: GitTarget, file: GitFileChange, staged: boolean) =>
    request<GitDiff>("GET", gitUrl(target, "/git/diff", { path: file.path, staged: staged ? "1" : "0", ...(file.old_path ? { old: file.old_path } : {}) })),
  deleteGroup: (groupId: number) => request<{ ok: true }>("DELETE", `/api/groups/${groupId}`),
  cancelRun: (runId: number) => request<{ ok: true }>("POST", `/api/runs/${runId}/cancel`),

  // 承認依頼・質問
  approvals: () => request<Approval[]>("GET", "/api/approvals"),
  resolveApproval: (id: string, decision: ApprovalDecision) =>
    request<{ ok: true }>("POST", `/api/approvals/${id}`, decision),
};

/** 添付ファイルを画面で開く・表示するための URL */
export function attachmentUrl(a: Attachment): string {
  return `/api/uploads/${a.id}?mime=${encodeURIComponent(a.mime)}`;
}
