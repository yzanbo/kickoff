import type { AgentState, Chat } from "@shared/types";
import { byActive } from "@/stores/chats";

// ボードのチャットの並び順（ツールバーの「並び順」で選び、ボード・リストの列・まとまりの中を同じ順に並べる）。
// 決まり: 同じ値どうしは最後に動いた順（byActive）。値のないもの（グループなし・モデル不明・コンテキスト不明）は、向きによらずいちばん後ろ

export const CHAT_SORT_KEYS = ["title", "project", "group", "state", "worktree", "model", "turns", "cost", "context", "active", "created"] as const;
export type ChatSortKey = (typeof CHAT_SORT_KEYS)[number];

/** 並べ方の名前（並び順のメニュー） */
export const CHAT_SORT_LABELS: Record<ChatSortKey, string> = {
  title: "名前",
  project: "プロジェクト",
  group: "グループ",
  state: "状態",
  worktree: "作業場所",
  model: "モデル",
  turns: "ターン数",
  cost: "費用",
  context: "コンテキスト",
  active: "最終更新",
  created: "作成日",
};

export type SortDir = "asc" | "desc";

export interface ChatSort {
  key: ChatSortKey;
  dir: SortDir;
}

/** 初めの並び（最後に動いた順。今までのボードの並び） */
export const DEFAULT_CHAT_SORT: ChatSort = Object.freeze({ key: "active", dir: "desc" });

/** 数・日時の列は、初めに押すと大きい・新しい順（文字の列は あ→ん・A→Z） */
const DESC_FIRST: ReadonlySet<ChatSortKey> = new Set(["turns", "cost", "context", "active", "created"]);

/** 見出しを押したときの次の並び: 同じ列なら向きを逆に、別の列ならその列の初めの向き */
export function nextChatSort(current: ChatSort, key: ChatSortKey): ChatSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: DESC_FIRST.has(key) ? "desc" : "asc" };
}

/** 保存した値を読む（合わなければ undefined） */
export function parseChatSort(value: unknown): ChatSort | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { key, dir } = value as Record<string, unknown>;
  if (!CHAT_SORT_KEYS.includes(key as ChatSortKey) || (dir !== "asc" && dir !== "desc")) return undefined;
  return { key: key as ChatSortKey, dir };
}

export const sameChatSort = (a: ChatSort, b: ChatSort) => a.key === b.key && a.dir === b.dir;

/** 状態の並び（カンバンの列の順。失敗は回答待ちの次） */
const STATE_RANK: Record<AgentState, number> = { running: 0, needs_input: 1, failed: 2, unread: 3, read: 4 };

/** 並べるのに要る、チャットの外の値（画面では useChatSort が店から渡す） */
export interface ChatSortContext {
  projectName: (projectId: number) => string;
  /** グループ名（グループなし・分からなければ undefined） */
  groupName: (chat: Chat) => string | undefined;
  stateOf: (chat: Chat) => AgentState;
}

type SortValue = string | number | undefined;

const collator = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });

/** コンテキストの使用率（0〜1。分からなければ undefined） */
export function contextRatio(chat: Pick<Chat, "context_tokens" | "context_window">): number | undefined {
  return chat.context_tokens != null && chat.context_window ? chat.context_tokens / chat.context_window : undefined;
}

function valueOf(chat: Chat, key: ChatSortKey, ctx: ChatSortContext): SortValue {
  switch (key) {
    case "title":
      return chat.title;
    case "project":
      return ctx.projectName(chat.project_id);
    case "group":
      return ctx.groupName(chat);
    case "state":
      return STATE_RANK[ctx.stateOf(chat)];
    case "worktree":
      // 本体が先、ワークツリーはブランチ名の順
      return `${chat.worktree_path ? 1 : 0}${chat.branch ?? ""}`;
    case "model":
      return chat.model ?? undefined;
    case "turns":
      return chat.num_turns;
    case "cost":
      return chat.cost_usd;
    case "context":
      return contextRatio(chat);
    case "active":
      return chat.active_at;
    case "created":
      return chat.created_at;
  }
}

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * 並び順の比べ方（Array.prototype.sort に渡す）。初めの並び（最後に動いた順）なら byActive そのもの。
 * 値は 1 回の並べ替えの中で引き直さないよう、チャットごとに覚える
 */
export function chatComparator(sort: ChatSort, ctx: ChatSortContext): (a: Chat, b: Chat) => number {
  if (sameChatSort(sort, DEFAULT_CHAT_SORT)) return byActive;
  const sign = sort.dir === "asc" ? 1 : -1;
  const cache = new Map<Chat, SortValue>();
  const value = (chat: Chat) => {
    if (!cache.has(chat)) cache.set(chat, valueOf(chat, sort.key, ctx));
    return cache.get(chat);
  };
  return (a, b) => {
    const va = value(a);
    const vb = value(b);
    // 値のないものは、向きによらずいちばん後ろ
    if (va === undefined || vb === undefined) return va === vb ? byActive(a, b) : va === undefined ? 1 : -1;
    return sign * compareValues(va, vb) || byActive(a, b);
  };
}
