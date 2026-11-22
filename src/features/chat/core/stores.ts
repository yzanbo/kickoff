// チャットの店の束（ChatStores）と、chat が読むほかの機能の店の仮の入れ物（Store）。createChat が作り、chat.api.store で上の機能に出す
import type { DatabaseSync } from "node:sqlite";
import type { Notify } from "@/foundation/core/db/common";
import type { Kernel } from "@/foundation/core/kernel";
import type { GroupStore } from "@/features/groups/core/index";
import type { ProjectStore } from "@/features/projects/core/index";
import type { TrashStore } from "@/features/trash/core/index";
import { createAgentSessionStore } from "./db/agentSessions";
import { createChatStore } from "./db/chats";
import { readSubagentEvents } from "./db/subagentEvents";
import { createEventStore } from "./db/events";
import { createLogRevisions } from "./db/logRevisions";
import { createOutboxStore } from "./db/outbox";
import type { RememberedSessionIds } from "./ports";

/**
 * チャットの表の店（チャット・記録・送信待ち・Kickoff が作ったセッション・記録を変えた知らせ）。
 * remembered: chat の表のほかで覚えているセッション（providerSwitch の離れた AI のセッション。会話記録を片付けるかの判定に足す）
 */
export function createChatStores(db: DatabaseSync, onChange: Notify, settings: Pick<Kernel["settings"], "get">, remembered: RememberedSessionIds) {
  /** 記録を足す以外の形で変えた知らせ（巻き戻し・セッションの付け替え・チャットの削除。コアの索引の覚えを捨てる合図） */
  const logRevisions = createLogRevisions();
  const chats = createChatStore(db, onChange, logRevisions, settings.get);
  const stores = {
    chats,
    events: { ...createEventStore(db, onChange, chats.get, remembered, logRevisions), forSubagents: (chatId: number) => readSubagentEvents(db, chatId) },
    outbox: createOutboxStore(db),
    /** Kickoff が作ったセッション（Claude Code の会話記録）の覚え（使われなくなったらゴミ箱へ） */
    agentSessions: createAgentSessionStore(db),
    logRevisions,
  };
  return stores;
}

export type ChatStores = ReturnType<typeof createChatStores>;

/** 定型文に足す口（snippets の店。chat より上の機能なので形だけで受ける） */
interface ChatSnippets {
  create(input: { project_id: number | null; label: string | null; text: string }): { id: number };
}

/**
 * chat の店の束（仮の形）: chat の店と、chat が読むほかの機能の店（下の projects・groups・trash と上の snippets）・土台の DB と設定。
 * 使う所を ChatStores と各機能の口に替えたら消す
 */
export type Store = ChatStores & {
  db: DatabaseSync;
  settings: Kernel["settings"];
  projects: ProjectStore;
  groups: GroupStore;
  trash: TrashStore;
  snippets: ChatSnippets;
};
