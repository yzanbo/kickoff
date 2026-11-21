// アーカイブ済みのチャットの整理。
// アーカイブしたチャットは自動では消さず、日数を選んだら、それより動いていないものをまとめて Kickoff のゴミ箱へ入れる（3 日は戻せる）
import { systemClock } from "@/foundation/core/clock";
import { familyOrder } from "@shared/chat/family";
import type { Chat } from "@shared/chat/types";
import type { ProviderId } from "@shared/settings/types";
import type { ArchiveCleanupPreview, ArchiveCleanupResult } from "@shared/trash/types";
import type { Store } from "@/features/chat/core/stores";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import { collectChatSessions, type RememberedSessions } from "./sessionCleanup";
import { trashChat, type ChatTrashDeps } from "./chatTrash";

/**
 * 整理するチャットの組（いちばん上のチャットと、一緒にゴミ箱へ入る子孫）。アーカイブ済みで before より前から動いていないもの。
 * 親がアーカイブしていない子チャット（子チャットだけアーカイブしたもの）は、その子からの組にする。子孫のどれかが作業中・before より後に動いていれば外す
 */
export function staleArchivedFamilies(chats: Chat[], before: string): Chat[][] {
  const byId = new Map(chats.map((c) => [c.id, c]));
  const isStale = (c: Chat) => c.archived_at !== null && c.active_at < before;
  const families: Chat[][] = [];
  for (const c of chats) {
    if (!isStale(c)) continue;
    // 親もアーカイブ済みなら、親からの組に入る（親が整理の対象でなければ、この子も入れない）
    const parent = c.parent_chat_id !== null ? byId.get(c.parent_chat_id) : undefined;
    if (parent && parent.archived_at !== null) continue;
    const family = familyOrder(c, chats);
    if (family.some((m) => m.status === "running" || m.active_at >= before)) continue;
    families.push(family);
  }
  return families;
}

/** 日数から「それより前」の時刻 */
export const cleanupBefore = (days: number, now = systemClock.now()): string => new Date(now - days * 86_400_000).toISOString();

const familiesOf = (store: Store, days: number, now?: number) => staleArchivedFamilies(store.chats.list({ includeArchived: true }), cleanupBefore(days, now));

/** 整理の見込み（入れるチャットの数と、会話記録のファイルの大きさ。大きさを数えられるプロバイダーがなければ null） */
export async function archiveCleanupPreview(deps: { store: Store; providers: Record<ProviderId, AgentProvider>; remembered?: RememberedSessions }, days: number, now?: number): Promise<ArchiveCleanupPreview> {
  const chats = familiesOf(deps.store, days, now).flat();
  const sessions = collectChatSessions(deps.store, chats, deps.remembered);
  let size: number | null = null;
  for (const [providerId, ids] of sessions.byProvider) {
    const counted = await deps.providers[providerId]?.sessions?.size?.([...ids], sessions.cwds).catch(() => null);
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
