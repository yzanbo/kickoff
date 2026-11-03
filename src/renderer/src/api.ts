import type {
  AppSettings,
  Attachment,
  Approval,
  ApprovalDecision,
  ModelOption,
  ProviderId,
  EffortDefault,
  QueuedMessage,
  ReconnectState,
  BackgroundState,
  Run,
  RunEvent,
  RunGroup,
  RunOptions,
  SearchHit,
  ServerStatus,
  FileContent,
  GitCommitDetail,
  GitDiff,
  GitFileChange,
  GitLog,
  GitRefs,
  GitWorktree,
  WorktreeRemovalInfo,
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
  ProviderStatus,
  VoiceStatus,
  WorkspaceInspection,
  FileRewindResult,
} from "../../core/types";

interface NewProjectInput {
  name: string;
  idea: string;
  parent_dir: string;
  folder_name: string;
}

interface RunDetail {
  run: Run;
  events: RunEvent[];
  approvals: Approval[];
  /** 作業中に送った、次の指示の待ちの列 */
  queue: QueuedMessage[];
  /** 待ちの列を、いまの作業が終わっても自動で送らずに止めておくか */
  queue_paused?: boolean;
  /** 「ここまで自動で送る」の印を付けた待ちの指示 */
  queue_stop_after?: string | null;
  /** 通信が切れて止まり、つながったら自動で再開するのを待っているか */
  reconnect?: ReconnectState | null;
  /** 裏で動いている作業と、メインの返答が終わったか（作業中でなければ null） */
  background?: BackgroundState | null;
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

/** multipart（FormData）で送る（添付ファイル・音声） */
async function postForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form, credentials: "same-origin" });
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
        "name" | "description" | "provider" | "defaults" | "references" | "hue" | "tags"
      >
    > & { pinned?: boolean; archived?: boolean },
  ) =>
    request<Project>("PATCH", `/api/projects/${id}`, patch),
  deleteProject: (id: number) => request<{ ok: true }>("DELETE", `/api/projects/${id}`),
  reorderProjects: (ids: number[]) => request<{ ok: true }>("PUT", "/api/projects/order", { ids }),
  models: (provider: ProviderId) => request<ModelOption[]>("GET", `/api/providers/${provider}/models`),

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
      prompt: string;
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
    const [saved] = await postForm<Attachment[]>("/api/uploads", form);
    return saved;
  },
  renameRun: (runId: number, title: string) => request<Run>("PATCH", `/api/runs/${runId}`, { title }),
  /** eventId: 一番下まで見た記録（それより新しい返答があれば、未読のまま） */
  markSeen: (runId: number, eventId?: number) => request<Run>("POST", `/api/runs/${runId}/seen`, eventId === undefined ? undefined : { event_id: eventId }),
  markUnseen: (runId: number) => request<Run>("POST", `/api/runs/${runId}/unseen`),
  pinRun: (runId: number, pinned: boolean) => request<Run>("POST", `/api/runs/${runId}/pin`, { pinned }),
  compactRun: (runId: number) => request<Run>("POST", `/api/runs/${runId}/compact`),
  archiveRun: (runId: number, archived = true) => request<Run>("POST", `/api/runs/${runId}/archive`, { archived }),
  deleteRun: (runId: number) => request<{ ok: true }>("DELETE", `/api/runs/${runId}`),
  setRunGroup: (runId: number, groupId: number | null) => request<Run>("PATCH", `/api/runs/${runId}`, { group_id: groupId }),
  /** チャットを別のプロジェクトへ移す（グループ・作業場所は外れ、移した先の本体で作業する。会話は続く） */
  moveRun: (runId: number, projectId: number) => request<Run>("POST", `/api/runs/${runId}/move`, { project_id: projectId }),
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
  removeWorktree: (projectId: number, path: string, force = false, deleteBranch = false) =>
    request<GitWorktree[]>("POST", `/api/projects/${projectId}/git/worktrees/remove`, { path, force, deleteBranch }),
  /** ワークツリーを消す前の確かめ（コミットしていない変更・プッシュしていないコミット・このブランチにしかないコミット） */
  worktreeRemovalInfo: (projectId: number, path: string) =>
    request<WorktreeRemovalInfo>("GET", `/api/projects/${projectId}/git/worktrees/info?path=${encodeURIComponent(path)}`),
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

  // 作業中に送る次の指示の待ちの列（作業中でなければすぐ送る）
  queueMessage: (runId: number, text: string, options: RunOptions, attachments: Attachment[] = []) =>
    request<{ queued: boolean; id?: string }>("POST", `/api/runs/${runId}/queue`, { text, options, attachments }),
  /** attachments: 添付を置き換える（省けば今のまま） */
  editQueued: (runId: number, id: string, text: string, attachments?: Attachment[]) =>
    request<{ queue: QueuedMessage[] }>("PATCH", `/api/runs/${runId}/queue/${id}`, attachments ? { text, attachments } : { text }),
  removeQueued: (runId: number, id: string) => request<{ queue: QueuedMessage[] }>("DELETE", `/api/runs/${runId}/queue/${id}`),
  moveQueued: (runId: number, id: string, index: number) =>
    request<{ queue: QueuedMessage[] }>("POST", `/api/runs/${runId}/queue/${id}/move`, { index }),
  /** 推論の深さを指定しないとき（既定）に Claude Code が使う深さ（設定から求める） */
  effortDefault: (projectId: number, model: string | null, worktree?: string) =>
    request<EffortDefault>("GET", `/api/projects/${projectId}/effort-default?${new URLSearchParams({ ...(model ? { model } : {}), ...(worktree ? { worktree } : {}) })}`),
  /** 作業の終わり（result イベント）の時点から、新しいチャットに分岐する */
  forkRun: (runId: number, eventId: number) => request<Run>("POST", `/api/runs/${runId}/fork`, { event_id: eventId }),
  /** 自分の発言（user イベント）の手前まで巻き戻して、書き直した文で送り直す（添付は元の発言のもの。ファイルの変更は戻さない） */
  rewindRun: (runId: number, eventId: number, text: string, options: RunOptions = {}, restoreFiles = false) =>
    request<Run>("POST", `/api/runs/${runId}/rewind`, { event_id: eventId, text, options, restore_files: restoreFiles }),
  /** 別のチャットのやり取りを Markdown の記録にして、添付ファイルとして保存する（いまのチャットに添えて AI に読ませる） */
  chatTranscript: (runId: number) => request<Attachment>("POST", `/api/runs/${runId}/transcript`),
  /** ファイルだけを、自分の発言を送る前の状態に戻す（dryRun なら戻さずに、変わる量だけ） */
  rewindFiles: (runId: number, eventId: number, dryRun: boolean) =>
    request<FileRewindResult>("POST", `/api/runs/${runId}/rewind-files`, { event_id: eventId, dry_run: dryRun }),
  /**
   * 止めずに伝える（作業中なら、いまのやり取りに発言を足す。足せなければ待ちの列へ。作業中でなければすぐ送る）。
   * result: told = 足した / queued = 待ちの列に入れた / sent = すぐ送った
   */
  tellRun: (runId: number, text: string, options: RunOptions, attachments: Attachment[] = []) =>
    request<{ result: "told" | "queued" | "sent" }>("POST", `/api/runs/${runId}/tell`, { text, options, attachments }),
  /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド） */
  stopBackgroundTask: (runId: number, taskId: string) => request<{ ok: true }>("POST", `/api/runs/${runId}/background/${encodeURIComponent(taskId)}/stop`),
  /** 待ちの列を、終わっても自動で送らずに止めておくか（戻すと、作業中でなければ先頭をすぐ送る） */
  setQueuePaused: (runId: number, paused: boolean) =>
    request<{ paused: boolean; queue: QueuedMessage[] }>("PUT", `/api/runs/${runId}/queue/paused`, { paused }),
  /** 「ここまで自動で送る」の印を付ける・外す（その指示を送ったら止めておく） */
  setQueueStopAfter: (runId: number, id: string | null) =>
    request<{ stop_after: string | null; queue: QueuedMessage[] }>("PUT", `/api/runs/${runId}/queue/stop-after`, { id }),
  /** 待ちの指示をすべて消す */
  clearQueued: (runId: number) => request<{ removed: number; queue: QueuedMessage[] }>("DELETE", `/api/runs/${runId}/queue`),
  /** 待ちの指示をすべて（ids を渡せば選んだものだけ）1 つにまとめて、すぐ送る（作業中なら止めずに、いまのやり取りに伝える） */
  sendAllQueued: (runId: number, ids?: string[]) => request<{ ok: true }>("POST", `/api/runs/${runId}/queue/send-all`, ids ? { ids } : {}),
  /** 選んだ待ちの指示をまとめて消す */
  removeQueuedMany: (runId: number, ids: string[]) =>
    request<{ removed: number; queue: QueuedMessage[] }>("POST", `/api/runs/${runId}/queue/remove-many`, { ids }),
  /** 選んだ待ちの指示を、並びを保ったまままとめて移す（いちばん上・いちばん下、または { before: その指示の前（null ならいちばん下） }） */
  moveQueuedMany: (runId: number, ids: string[], to: "top" | "bottom" | { before: string | null }) =>
    request<{ moved: number; queue: QueuedMessage[] }>(
      "POST",
      `/api/runs/${runId}/queue/move-many`,
      typeof to === "string" ? { ids, to } : { ids, before: to.before },
    ),
  sendQueuedNow: (runId: number, id: string) => request<{ ok: true }>("POST", `/api/runs/${runId}/queue/${id}/send`),

  // 音声入力（文字起こし・準備の状態・この Mac のモデル・OpenAI の API キー）
  /** 録った音声を文にする（language を省けば設定の言語） */
  transcribe: (audio: Blob, language?: string) => {
    const form = new FormData();
    form.append("file", audio, `voice.${audio.type.includes("mp4") ? "m4a" : "webm"}`);
    if (language) form.append("language", language);
    return postForm<{ text: string }>("/api/transcribe", form);
  },
  voiceStatus: () => request<VoiceStatus>("GET", "/api/voice"),
  downloadVoiceModel: (id: string) => request<VoiceStatus>("POST", `/api/voice/models/${encodeURIComponent(id)}/download`),
  deleteVoiceModel: (id: string) => request<VoiceStatus>("DELETE", `/api/voice/models/${encodeURIComponent(id)}`),
  /** OpenAI の API キーを保存する（空なら消す）。キーは返らず、保存したかだけ */
  saveOpenAiKey: (key: string) => request<{ saved: boolean }>("PUT", "/api/voice/openai-key", { key }),

  // 承認依頼・質問
  approvals: () => request<Approval[]>("GET", "/api/approvals"),
  /** 通信が切れて止まったチャットを、つながったら自動で再開するのをやめる */
  stopReconnect: (runId: number) => request<{ ok: true }>("DELETE", `/api/runs/${runId}/reconnect`),
  resolveApproval: (id: string, decision: ApprovalDecision) =>
    request<{ ok: true }>("POST", `/api/approvals/${id}`, decision),
};

/** 添付ファイルを画面で開く・表示するための URL */
export function attachmentUrl(a: Attachment): string {
  return `/api/uploads/${a.id}?mime=${encodeURIComponent(a.mime)}`;
}
