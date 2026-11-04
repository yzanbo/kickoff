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
  Chat,
  ChatEvent,
  ChatGroup,
  ChatOptions,
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
} from "@shared/types";

interface NewProjectInput {
  name: string;
  idea: string;
  parent_dir: string;
  folder_name: string;
}

interface ChatDetail {
  chat: Chat;
  events: ChatEvent[];
  approvals: Approval[];
  /** 作業中に送った、次の指示の待ちの列 */
  queue: QueuedMessage[];
  /** 待ちの列を、いまの作業が終わっても自動で送らずに止めておくか */
  queue_paused?: boolean;
  /** 一時停止の印の位置（0 = 1 件目の上、n = n 件目のあと） */
  queue_stops?: number[];
  /** 次の指示を書き直しているので、送らずに書き直しが終わるのを待っている（送信の準備ができている） */
  queue_waiting_edit?: boolean;
  /** 通信が切れて止まり、つながったら自動で再開するのを待っているか */
  reconnect?: ReconnectState | null;
  /** 裏で動いている作業と、メインの返答が終わったか（作業中でなければ null） */
  background?: BackgroundState | null;
  /** 停止を頼んで、作業が終わるのを待っているか */
  stopping?: boolean;
  /** 会話を圧縮している最中なら、始めた時刻 */
  compacting?: string | null;
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
  chats: (projectId: number, opts: { archived?: boolean } = {}) =>
    request<Chat[]>("GET", `/api/projects/${projectId}/chats${opts.archived ? "?archived=1" : ""}`),
  allChats: (opts: { archived?: boolean } = {}) => request<Chat[]>("GET", `/api/chats?limit=300${opts.archived ? "&archived=1" : ""}`),
  search: (q: string, scope: { projectId?: number; chatId?: number } = {}) => {
    const params = new URLSearchParams({ q });
    if (scope.projectId !== undefined) params.set("project_id", String(scope.projectId));
    if (scope.chatId !== undefined) params.set("chat_id", String(scope.chatId));
    return request<SearchHit[]>("GET", `/api/search?${params}`);
  },
  startChat: (
    projectId: number,
    input: {
      prompt: string;
      options: ChatOptions;
      attachments?: Attachment[];
      group_id?: number;
      /** 作業場所: いまあるワークツリーのフォルダ、または新しく作るワークツリーのブランチ名（どちらもなければ本体） */
      worktree_path?: string;
      new_worktree_branch?: string;
    },
  ) => request<Chat>("POST", `/api/projects/${projectId}/chats`, input),
  run: (id: number) => request<ChatDetail>("GET", `/api/chats/${id}`),
  sendMessage: (chatId: number, text: string, options: ChatOptions, attachments: Attachment[] = []) =>
    request<Chat>("POST", `/api/chats/${chatId}/messages`, { text, options, attachments }),

  /** 添付ファイルをアップロードする */
  upload: async (file: File): Promise<Attachment> => {
    const form = new FormData();
    form.append("file", file);
    const [saved] = await postForm<Attachment[]>("/api/uploads", form);
    return saved;
  },
  renameChat: (chatId: number, title: string) => request<Chat>("PATCH", `/api/chats/${chatId}`, { title }),
  /** eventId: 一番下まで見た記録（それより新しい返答があれば、未読のまま） */
  markSeen: (chatId: number, eventId?: number) => request<Chat>("POST", `/api/chats/${chatId}/seen`, eventId === undefined ? undefined : { event_id: eventId }),
  markUnseen: (chatId: number) => request<Chat>("POST", `/api/chats/${chatId}/unseen`),
  pinChat: (chatId: number, pinned: boolean) => request<Chat>("POST", `/api/chats/${chatId}/pin`, { pinned }),
  compactChat: (chatId: number) => request<Chat>("POST", `/api/chats/${chatId}/compact`),
  archiveChat: (chatId: number, archived = true) => request<Chat>("POST", `/api/chats/${chatId}/archive`, { archived }),
  deleteChat: (chatId: number) => request<{ ok: true }>("DELETE", `/api/chats/${chatId}`),
  setChatGroup: (chatId: number, groupId: number | null) => request<Chat>("PATCH", `/api/chats/${chatId}`, { group_id: groupId }),
  /** チャットを別のプロジェクトへ移す（グループ・作業場所は外れ、移した先の本体で作業する。会話は続く） */
  moveChat: (chatId: number, projectId: number) => request<Chat>("POST", `/api/chats/${chatId}/move`, { project_id: projectId }),
  groups: (projectId: number) => request<ChatGroup[]>("GET", `/api/projects/${projectId}/groups`),
  createGroup: (projectId: number, name: string) => request<ChatGroup>("POST", `/api/projects/${projectId}/groups`, { name }),
  renameGroup: (groupId: number, name: string) => request<ChatGroup>("PATCH", `/api/groups/${groupId}`, { name }),
  reorderGroups: (projectId: number, ids: number[]) => request<ChatGroup[]>("PUT", `/api/projects/${projectId}/groups/order`, { ids }),
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
  cancelChat: (chatId: number) => request<{ ok: true }>("POST", `/api/chats/${chatId}/cancel`),

  // 作業中に送る次の指示の待ちの列（作業中でなければすぐ送る。hold なら作業していなくても列の最後に足す）
  queueMessage: (chatId: number, text: string, options: ChatOptions, attachments: Attachment[] = [], hold = false) =>
    request<{ queued: boolean; id?: string }>("POST", `/api/chats/${chatId}/queue`, { text, options, attachments, ...(hold ? { hold } : {}) }),
  /** attachments: 添付を置き換える（省けば今のまま） */
  editQueued: (chatId: number, id: string, text: string, attachments?: Attachment[]) =>
    request<{ queue: QueuedMessage[] }>("PATCH", `/api/chats/${chatId}/queue/${id}`, attachments ? { text, attachments } : { text }),
  removeQueued: (chatId: number, id: string) => request<{ queue: QueuedMessage[] }>("DELETE", `/api/chats/${chatId}/queue/${id}`),
  moveQueued: (chatId: number, id: string, index: number) =>
    request<{ queue: QueuedMessage[] }>("POST", `/api/chats/${chatId}/queue/${id}/move`, { index }),
  /** 推論の深さを指定しないとき（既定）に Claude Code が使う深さ（設定から求める） */
  effortDefault: (projectId: number, model: string | null, worktree?: string) =>
    request<EffortDefault>("GET", `/api/projects/${projectId}/effort-default?${new URLSearchParams({ ...(model ? { model } : {}), ...(worktree ? { worktree } : {}) })}`),
  /** 作業の終わり（result イベント）の時点から、新しいチャットに分岐する */
  forkChat: (chatId: number, eventId: number) => request<Chat>("POST", `/api/chats/${chatId}/fork`, { event_id: eventId }),
  /** 自分の発言（user イベント）の手前まで巻き戻して、書き直した文で送り直す（添付は元の発言のもの。ファイルの変更は戻さない） */
  rewindChat: (chatId: number, eventId: number, text: string, options: ChatOptions = {}, restoreFiles = false) =>
    request<Chat>("POST", `/api/chats/${chatId}/rewind`, { event_id: eventId, text, options, restore_files: restoreFiles }),
  /** 別のチャットのやり取りを Markdown の記録にして、添付ファイルとして保存する（いまのチャットに添えて AI に読ませる） */
  chatTranscript: (chatId: number) => request<Attachment>("POST", `/api/chats/${chatId}/transcript`),
  /** ファイルだけを、自分の発言を送る前の状態に戻す（dryRun なら戻さずに、変わる量だけ） */
  rewindFiles: (chatId: number, eventId: number, dryRun: boolean) =>
    request<FileRewindResult>("POST", `/api/chats/${chatId}/rewind-files`, { event_id: eventId, dry_run: dryRun }),
  /**
   * 止めずに伝える（作業中なら、いまのやり取りに発言を足す。足せなければ待ちの列へ。作業中でなければすぐ送る）。
   * result: told = 足した / queued = 待ちの列に入れた / sent = すぐ送った
   */
  tellChat: (chatId: number, text: string, options: ChatOptions, attachments: Attachment[] = []) =>
    request<{ result: "told" | "queued" | "sent" }>("POST", `/api/chats/${chatId}/tell`, { text, options, attachments }),
  /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド） */
  stopBackgroundTask: (chatId: number, taskId: string) => request<{ ok: true }>("POST", `/api/chats/${chatId}/background/${encodeURIComponent(taskId)}/stop`),
  /** 待ちの列を、終わっても自動で送らずに止めておくか（戻すと、作業中でなければ先頭をすぐ送る） */
  setQueuePaused: (chatId: number, paused: boolean) =>
    request<{ paused: boolean; queue: QueuedMessage[] }>("PUT", `/api/chats/${chatId}/queue/paused`, { paused }),
  /** その指示のすぐあとに一時停止の印を付ける・外す（右クリックの「この指示のあとで止める」。id が null ならすべて外す） */
  setQueueStopAfter: (chatId: number, id: string | null, stop = true) =>
    request<{ stops: number[]; queue: QueuedMessage[] }>("PUT", `/api/chats/${chatId}/queue/stop-after`, { id, stop }),
  /** 印の位置をまとめて置き換える（印のドラッグ・×。0 = 1 件目の上、n = n 件目のあと） */
  setQueueStops: (chatId: number, stops: number[]) =>
    request<{ stops: number[]; queue: QueuedMessage[] }>("PUT", `/api/chats/${chatId}/queue/stops`, { stops }),
  /** 待ちの指示をすべて消す */
  /** 画面でいま書き直している待ちの指示（丸ごと置き換え。空なら外す）。次に送る指示なら、書き直しが終わるまで送らない */
  setQueueEditing: (chatId: number, ids: string[]) => request<{ ok: true }>("PUT", `/api/chats/${chatId}/queue/editing`, { ids }),
  clearQueued: (chatId: number) => request<{ removed: number; queue: QueuedMessage[] }>("DELETE", `/api/chats/${chatId}/queue`),
  /** 待ちの指示をすべて（ids を渡せば選んだものだけ）1 つにまとめて、すぐ送る（作業中なら止めずに、いまのやり取りに伝える） */
  sendAllQueued: (chatId: number, ids?: string[]) => request<{ ok: true }>("POST", `/api/chats/${chatId}/queue/send-all`, ids ? { ids } : {}),
  /** 選んだ待ちの指示を、送らずに 1 件にまとめる（2 件以上） */
  mergeQueued: (chatId: number, ids: string[]) => request<{ id: string; queue: QueuedMessage[] }>("POST", `/api/chats/${chatId}/queue/merge`, { ids }),
  /** 待ちの指示をすべて、1 件ずつ別々の発言として順に送る（止めておくのをやめ、印を外す） */
  sendQueuedInOrder: (chatId: number) => request<{ ok: true }>("POST", `/api/chats/${chatId}/queue/send-in-order`),
  /** 選んだ待ちの指示をまとめて消す */
  removeQueuedMany: (chatId: number, ids: string[]) =>
    request<{ removed: number; queue: QueuedMessage[] }>("POST", `/api/chats/${chatId}/queue/remove-many`, { ids }),
  /**
   * 選んだ待ちの指示を、並びを保ったまままとめて移す（いちばん上・いちばん下、または { before: その指示の前（null ならいちばん下）,
   * belowStop: その位置に止める線があれば線の下に入れるか }）
   */
  moveQueuedMany: (chatId: number, ids: string[], to: "top" | "bottom" | { before: string | null; belowStop?: boolean }) =>
    request<{ moved: number; queue: QueuedMessage[] }>(
      "POST",
      `/api/chats/${chatId}/queue/move-many`,
      typeof to === "string" ? { ids, to } : { ids, before: to.before, ...(to.belowStop === undefined ? {} : { below_stop: to.belowStop }) },
    ),
  sendQueuedNow: (chatId: number, id: string) => request<{ ok: true }>("POST", `/api/chats/${chatId}/queue/${id}/send`),

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
  stopReconnect: (chatId: number) => request<{ ok: true }>("DELETE", `/api/chats/${chatId}/reconnect`),
  resolveApproval: (id: string, decision: ApprovalDecision) =>
    request<{ ok: true }>("POST", `/api/approvals/${id}`, decision),
};

/** 添付ファイルを画面で開く・表示するための URL */
export function attachmentUrl(a: Attachment): string {
  return `/api/uploads/${a.id}?mime=${encodeURIComponent(a.mime)}`;
}
