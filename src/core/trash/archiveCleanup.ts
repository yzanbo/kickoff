// アーカイブ済みのチャットの整理（メモの仕様書「ファイル削除」の Q19。2026-11-14 に利用者と決めた）。
// アーカイブしたチャットは自動では消さず、日数を選んだら、それより動いていないものをまとめて Kickoff のゴミ箱へ入れる（3 日は戻せる）
import type { ArchiveCleanupPreview, ArchiveCleanupResult, Chat, ProviderId } from "@shared/types";
import type { Store } from "../db/store.js";
import type { AgentProvider } from "../providers/types.js";
import { collectChatSessions } from "../chat/sessionCleanup.js";
import { trashChat, type ChatTrashDeps } from "./chatTrash.js";

/**
 * 整理するチャットの組（いちばん上のチャットと、一緒にゴミ箱へ入る子孫）。アーカイブ済みで before より前から動いていないもの。
 * 親がアーカイブしていない子チャット（子チャットだけアーカイブしたもの）は、その子からの組にする。子孫のどれかが作業中・before より後に動いていれば外す
 */
export function staleArchivedFamilies(chats: Chat[], before: string): Chat[][] {
  const byId = new Map(chats.map((c) => [c.id, c]));
  const children = new Map<number, Chat[]>();
  for (const c of chats) {
    if (c.parent_chat_id === null) continue;
    const list = children.get(c.parent_chat_id) ?? [];
    list.push(c);
    children.set(c.parent_chat_id, list);
  }
  const familyOf = (root: Chat): Chat[] => {
    const out: Chat[] = [];
    const walk = (c: Chat) => {
      out.push(c);
      for (const child of children.get(c.id) ?? []) walk(child);
    };
    walk(root);
    return out;
  };
  const isStale = (c: Chat) => c.archived_at !== null && c.active_at < before;
  const families: Chat[][] = [];
  for (const c of chats) {
    if (!isStale(c)) continue;
    // 親もアーカイブ済みなら、親からの組に入る（親が整理の対象でなければ、この子も入れない）
    const parent = c.parent_chat_id !== null ? byId.get(c.parent_chat_id) : undefined;
    if (parent && parent.archived_at !== null) continue;
    const family = familyOf(c);
    if (family.some((m) => m.status === "running" || m.active_at >= before)) continue;
    families.push(family);
  }
  return families;
}

/** 日数から「それより前」の時刻 */
export const cleanupBefore = (days: number, now = Date.now()): string => new Date(now - days * 86_400_000).toISOString();

const familiesOf = (store: Store, days: number, now?: number) => staleArchivedFamilies(store.chats.list({ includeArchived: true }), cleanupBefore(days, now));

/** 整理の見込み（入れるチャットの数と、会話記録のファイルの大きさ。大きさを数えられるプロバイダーがなければ null） */
export async function archiveCleanupPreview(deps: { store: Store; providers: Record<ProviderId, AgentProvider> }, days: number, now?: number): Promise<ArchiveCleanupPreview> {
  const chats = familiesOf(deps.store, days, now).flat();
  const sessions = collectChatSessions(deps.store, chats);
  let size: number | null = null;
  for (const [providerId, ids] of sessions.byProvider) {
    const counted = await deps.providers[providerId]?.sessionsSize?.([...ids], sessions.cwds).catch(() => null);
    if (typeof counted === "number") size = (size ?? 0) + counted;
  }
  return { days, count: chats.length, size: chats.length === 0 ? 0 : size };
}

/** 整理する（組ごとに Kickoff のゴミ箱の 1 行。作業中になったものは飛ばす） */
export function runArchiveCleanup(deps: ChatTrashDeps, days: number, now?: number): ArchiveCleanupResult {
  let trashed = 0;
  for (const family of familiesOf(deps.store, days, now)) {
    try {
      trashChat(deps, family[0]);
      trashed += family.length;
    } catch {
      // 調べたあとに作業を始めたものは残す
    }
  }
  return { trashed };
}
