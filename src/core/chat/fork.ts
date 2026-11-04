import type { AgentProvider } from "../providers/types.js";
import type { Store } from "../db/store.js";
import type { ProviderId, Chat } from "@shared/types";
import { asInvalid, Invalid } from "../http/errors.js";

/**
 * チャットを、作業の終わり（result イベント）の時点から分岐する（「Fork chat from here」）。
 * その時点までの会話を新しいセッションに写し、新しいチャットにその時点までの記録を写す。元のチャットは変えない。
 * ファイルの変更は戻さない（作業場所は元のチャットと同じ）。分岐できない時点・プロバイダーなら 400
 */
export async function forkChat(deps: { store: Store; providers: Record<ProviderId, AgentProvider> }, chat: Chat, eventId: number, cwd: string): Promise<Chat> {
  const { store, providers } = deps;
  const event = store.events.list(chat.id).find((e) => e.id === eventId);
  const point = event?.type === "result" ? event.data : undefined;
  // 最後まで終わった作業の終わりからだけ分岐できる（止めた・失敗した作業の最後のメッセージはセッションに残らないことがある）
  if (point?.status !== "completed" || !point.session_id || !point.message_id) throw new Invalid("この時点からは分岐できません");
  const provider = providers[chat.provider];
  if (!provider.fork) throw new Invalid(`${provider.label} は分岐に対応していません`);
  const sessionId = await provider.fork(point.session_id, point.message_id, cwd).catch(asInvalid);

  const forked = store.chats.create({
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
  store.events.copy(chat.id, forked.id, eventId);
  store.events.add(forked.id, { type: "notice", message: `「${chat.title}」のこの時点から分岐しました（ファイルの変更は戻していません）` });
  return store.chats.update(forked.id, { session_id: sessionId, branch: chat.branch, context_window: chat.context_window });
}
