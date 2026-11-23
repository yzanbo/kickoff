// チャットのテストのデータ（コアと画面とスマホのテストで共通。テストからだけ使う）。省いた項目は、それらしい既定値で埋める
import type { ChatEventDataOf, ChatEventOf, ChatEventType } from "@shared/chat/chatEvent";
import { EMPTY_CHAT_LIVE, type ChatLive } from "@shared/chat/chatLive";
import type { Attachment, Chat, QueuedMessage } from "@shared/chat/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { TEST_TIME } from "@shared/foundation/testing/data";

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

/** 添付（既定はファイル「<id>.png」・1 バイト。ノート・「AI に渡す」で取ったものは patch の kind とその項目で） */
export function makeAttachment(id: string, patch: Partial<Attachment> = {}): Attachment {
  return { kind: "file", id, name: `${id}.png`, mime: "image/png", size: 1, ...patch } as Attachment;
}

/** 作業中の様子（何も起きていない: 送信待ちは空・自動で送る） */
export function makeChatLive(patch: Partial<ChatLive> = {}): ChatLive {
  return { ...EMPTY_CHAT_LIVE, ...patch };
}

/** サブエージェントの一覧の行（説明は key、動いている） */
export function makeSubagent(key: string, patch: Partial<SubagentEntry> = {}): SubagentEntry {
  return { key, description: key, status: "running", ...patch };
}

/** 送信待ちの 1 件（本文は id・添付なし・選択なし） */
export function makeQueuedMessage(id: string, patch: Partial<QueuedMessage> = {}): QueuedMessage {
  return { id, text: id, attachments: [], options: {}, created_at: "", ...patch };
}
