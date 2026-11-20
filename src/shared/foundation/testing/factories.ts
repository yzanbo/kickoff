// テストのデータを作る関数（コアと画面のテストで共通。テストからだけ使う）。省いた項目は、それらしい既定値で埋める。
// Node・DOM に依存しない
import { PROVIDER_FEATURES, type ProviderStatus } from "@shared/ai/types";
import type { ChatEventDataOf, ChatEventOf, ChatEventType } from "@shared/chat/chatEvent";
import type { ChatLive } from "@shared/chat/chatLive";
import type { Attachment, Chat } from "@shared/chat/types";
import type { GitWorktree } from "@shared/git/types";
import type { GitHubPullDetail, GitHubReviewThread } from "@shared/github/types";
import type { ChatGroup } from "@shared/groups/types";
import type { Project } from "@shared/projects/types";
import { PROVIDER_LABELS, type ProviderId } from "@shared/settings/types";
import type { Snippet } from "@shared/snippets/types";
import type { BusEvent } from "@shared/foundation/contract";
import type { SubagentEntry } from "@shared/chat/subagents";

/** 既定の時刻 */
const TEST_TIME = "2026-11-01T00:00:00Z";

/** チャット（名前は「チャット<id>」、プロジェクト 1・完了・既読） */
export function makeChat(id: number, patch: Partial<Chat> = {}): Chat {
  return {
    id,
    project_id: 1,
    provider: "claude",
    title: `チャット${id}`,
    status: "completed",
    session_id: null,
    model: null,
    effort: null,
    permission_mode: "default",
    sandbox_enabled: true,
    edit_scope_enabled: true,
    fast_mode: false,
    cost_usd: 0,
    num_turns: 0,
    error: null,
    unread: false,
    archived_at: null,
    pinned: false,
    position: null,
    group_id: null,
    worktree_path: null,
    branch: null,
    finished_worktree_branch: null,
    turn_started_at: null,
    context_tokens: null,
    context_window: null,
    parent_chat_id: null,
    parent_event_id: null,
    note_path: null,
    untracked_only: false,
    github_repo: null,
    github_number: null,
    github_kind: null,
    created_at: TEST_TIME,
    active_at: TEST_TIME,
    ...patch,
  };
}

/** プロジェクト（名前は「プロジェクト<id>」、並び順は id） */
export function makeProject(id: number, patch: Partial<Project> = {}): Project {
  return {
    id,
    name: `プロジェクト${id}`,
    description: null,
    repo_path: `/repo/p${id}`,
    provider: "claude",
    provider_chat_defaults: {},
    reference_paths: [],
    position: id,
    pinned: false,
    archived_at: null,
    hue: 0,
    tags: [],
    note_folder: null,
    note_dir: null,
    pre_compact_prompt: null,
    post_compact_prompt: null,
    pre_compact_enabled: true,
    post_compact_enabled: true,
    github_account: null,
    github_remote: null,
    pr_watch: true,
    ci_watch: true,
    created_at: TEST_TIME,
    ...patch,
  };
}

/** チャットのグループ（名前は「G<id>」、プロジェクト 1、並び順は id） */
export function makeGroup(id: number, patch: Partial<ChatGroup> = {}): ChatGroup {
  return { id, project_id: 1, name: `G${id}`, position: id, hue: 0, created_at: TEST_TIME, ...patch };
}

/** PR の行のスレッド（ID は「t<id>」、src/a.ts の新しい側の 1 行目・解決していない・コメント 1 つ） */
export function makeReviewThread(id: number, patch: Partial<GitHubReviewThread> = {}): GitHubReviewThread {
  return {
    id: `t${id}`,
    path: "src/a.ts",
    line: 1,
    original_line: 1,
    side: "RIGHT",
    resolved: false,
    outdated: false,
    can_reply: true,
    can_resolve: true,
    comments: [{ id: `c${id}`, author: null, created_at: TEST_TIME, body_html: "<p>コメント</p>", body_markdown: "コメント", diff_hunk: "@@ -1 +1 @@", url: null }],
    ...patch,
  };
}

/** PR の中身（o/r の #5「直す」・本文「本文」・会話もスレッドもなし。issue にするなら item.kind を issue に） */
export function makePullDetail(patch: Partial<GitHubPullDetail> = {}): GitHubPullDetail {
  return {
    item: {
      kind: "pr",
      number: 5,
      title: "直す",
      state: "open",
      state_reason: null,
      url: "https://github.com/o/r/pull/5",
      author: { login: "me", avatar_url: null },
      labels: [],
      assignees: [],
      milestone: null,
      comments: 0,
      created_at: TEST_TIME,
      updated_at: TEST_TIME,
      closed_at: null,
      is_draft: false,
      review_decision: null,
      checks: null,
      head_ref: "fix",
      base_ref: "main",
    },
    body_html: "<p>本文</p>",
    body_markdown: "本文",
    timeline: [],
    timeline_truncated: false,
    linked_pulls: [],
    viewer: { can_close: true, can_reopen: true, can_label: true },
    fetched_at: TEST_TIME,
    additions: 1,
    deletions: 0,
    changed_files: 1,
    head_sha: "abc",
    head_owner: "o",
    mergeable: "mergeable",
    merge_state: "clean",
    merge_methods: ["merge", "squash", "rebase"],
    can_merge: true,
    approvals: 0,
    review_threads: [],
    checks: [],
    ...patch,
  };
}

/** makeEvent に渡す中身（type ごとの形。発言の message_uuid とツールの結果の is_error は省ける） */
export type EventInput<T extends ChatEventType> = T extends "user"
  ? Omit<ChatEventDataOf<"user">, "message_uuid"> & { message_uuid?: string }
  : T extends "tool_result"
    ? Omit<ChatEventDataOf<"tool_result">, "is_error"> & { is_error?: boolean }
    : ChatEventDataOf<T>;

/** 省いた項目の既定値 */
const FILL: Partial<Record<ChatEventType, (id: number) => object>> = {
  user: (id) => ({ message_uuid: `u${id}` }),
  tool_result: () => ({ is_error: false }),
};

/** 記録に添えるもの（既定はチャット 1・既定の時刻） */
interface EventMeta {
  chat_id?: number;
  created_at?: string;
}

/** チャットの記録の 1 件。type で data の形が決まる */
export function makeEvent<T extends ChatEventType>(id: number, type: T, data: EventInput<T>, meta: EventMeta = {}): ChatEventOf<T> {
  return { id, chat_id: meta.chat_id ?? 1, type, data: { ...FILL[type]?.(id), ...data }, created_at: meta.created_at ?? TEST_TIME } as unknown as ChatEventOf<T>;
}

/** id を 1 から順に振る makeEvent（記録の並びだけが大事なテスト用） */
export function eventSequence() {
  let id = 0;
  return <T extends ChatEventType>(type: T, data: EventInput<T>, meta?: EventMeta) => makeEvent(++id, type, data, meta);
}

/** ワークツリー（作業するフォルダ・一番上ともに path、ブランチなし・本体でない） */
export function makeWorktree(path: string, patch: Partial<GitWorktree> = {}): GitWorktree {
  return { path, root: path, branch: null, head: "0000000", main: false, locked: false, prunable: false, ...patch };
}

/** AI の CLI の状態（名前は PROVIDER_LABELS、対応済み・入っている・ログインしている・できることはすべて） */
export function makeProviderStatus(id: ProviderId, patch: Partial<ProviderStatus> = {}): ProviderStatus {
  return { id, label: PROVIDER_LABELS[id], implemented: true, installed: true, logged_in: true, detail: "", features: [...PROVIDER_FEATURES], ...patch };
}

/** 添付（既定はファイル「<id>.png」・1 バイト。ノート・「AI に渡す」で取ったものは patch の kind とその項目で） */
export function makeAttachment(id: string, patch: Partial<Attachment> = {}): Attachment {
  return { kind: "file", id, name: `${id}.png`, mime: "image/png", size: 1, ...patch } as Attachment;
}

/** 作業中の様子（何も起きていない: 送信待ちは空・自動で送る） */
export function makeChatLive(patch: Partial<ChatLive> = {}): ChatLive {
  return {
    queue: { messages: [], paused: false, stops: [], waiting_edit: false },
    background: null,
    retry: null,
    reconnect: null,
    compacting: null,
    stopping: false,
    drawing_visual: false,
    after_compact: [],
    awaiting_compact: false,
    compact_after_turn: false,
    compacted_turn: false,
    tells_closed: false,
    inheriting: false,
    workplace_move: null,
    restart_resume: null,
    ...patch,
  };
}

/** サブエージェントの一覧の行（説明は key、動いている） */
export function makeSubagent(key: string, patch: Partial<SubagentEntry> = {}): SubagentEntry {
  return { key, description: key, status: "running", ...patch };
}

/** 定型文（共通・名前なし・本文「本文<id>」・並び順は id） */
export function makeSnippet(id: number, patch: Partial<Snippet> = {}): Snippet {
  return { id, project_id: null, label: null, text: `本文${id}`, position: id, created_at: TEST_TIME, updated_at: TEST_TIME, ...patch };
}

/** SSE の知らせ（type で残りの形が決まる） */
export function busEvent<T extends BusEvent["type"]>(type: T, data: Omit<Extract<BusEvent, { type: T }>, "type">): Extract<BusEvent, { type: T }> {
  return { type, ...data } as Extract<BusEvent, { type: T }>;
}
