import type { AgentProvider } from "../providers/types.js";
import type { Store } from "../db/store.js";
import type { ProviderId, Chat } from "@shared/types";

/**
 * チャットを、作業の終わり（result イベント）の時点から分岐する（「Fork chat from here」）。
 * その時点までの会話を新しいセッションに写し、新しいチャットにその時点までの記録を写す。元のチャットは変えない。
 * ファイルの変更は戻さない（作業場所は元のチャットと同じ）。分岐できない時点・プロバイダーなら投げる（ルートで 400）
 */
export async function forkChat(deps: { store: Store; providers: Record<ProviderId, AgentProvider> }, chat: Chat, eventId: number, cwd: string): Promise<Chat> {
  const { store, providers } = deps;
  const event = store.listEvents(chat.id).find((e) => e.id === eventId);
  const point = event?.type === "result" ? (event.data as { status?: string; session_id?: string; message_id?: string }) : undefined;
  // 止めた・失敗した作業の終わり（以前の記録には message_id が付いている）からは分岐できない
  if (point?.status !== "completed" || !point.session_id || !point.message_id) throw new Error("この時点からは分岐できません");
  const provider = providers[chat.provider];
  if (!provider.fork) throw new Error(`${provider.label} は分岐に対応していません`);
  const sessionId = await provider.fork(point.session_id, point.message_id, cwd);

  const forked = store.createChat({
    project_id: chat.project_id,
    provider: chat.provider,
    title: `${chat.title}（分岐）`,
    status: "completed",
    model: chat.model,
    effort: chat.effort,
    permission_mode: chat.permission_mode,
    fast_mode: chat.fast_mode,
    group_id: chat.group_id,
    worktree_path: chat.worktree_path,
  });
  store.copyEvents(chat.id, forked.id, eventId);
  store.addEvent(forked.id, { type: "notice", message: `「${chat.title}」のこの時点から分岐しました（ファイルの変更は戻していません）` });
  return store.updateChat(forked.id, { session_id: sessionId, branch: chat.branch, context_window: chat.context_window });
}
