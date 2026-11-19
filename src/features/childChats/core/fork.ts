import type { AgentProvider } from "@/features/ai/core/providers/types";
import type { Store } from "@/foundation/core/db/store";
import { providerFeatureMissing, type ProviderId, type Chat } from "@shared/types";
import { asInvalid, Invalid } from "@/foundation/core/errors";
import { isBeforeWorkplaceMove, WORKPLACE_FORK_LOCKED } from "@shared/workplaceMove/workplaceMoves";
import { isBeforeProviderSwitch, PROVIDER_FORK_LOCKED } from "@shared/providerSwitch/providerSwitch";

/**
 * チャットを、作業の終わり（result イベント）の時点から分岐する（「Fork chat from here」）。
 * その時点までの会話を新しいセッションに写し、新しいチャットにその時点までの記録を写す。元のチャットは変えない。
 * ファイルの変更は戻さない（作業場所は元のチャットと同じ）。分岐できない時点・プロバイダーなら 400
 */
export async function forkChat(deps: { store: Store; providers: Record<ProviderId, AgentProvider> }, chat: Chat, eventId: number, cwd: string): Promise<Chat> {
  const { store, providers } = deps;
  const events = store.events.list(chat.id);
  const event = events.find((e) => e.id === eventId);
  const point = event?.type === "result" ? event.data : undefined;
  // 作業場所を移した区切りより前の地点からは分岐できない（新しいチャットがどの作業場所で動くかが決まらない）
  if (event && isBeforeWorkplaceMove(events, event.id)) throw new Invalid(WORKPLACE_FORK_LOCKED);
  if (event && isBeforeProviderSwitch(events, event.id)) throw new Invalid(PROVIDER_FORK_LOCKED);
  // 最後まで終わった作業の終わりからだけ分岐できる（止めた・失敗した作業の最後のメッセージはセッションに残らないことがある）
  if (point?.status !== "completed" || !point.session_id || !point.message_id) throw new Invalid("この時点からは分岐できません");
  const provider = providers[chat.provider];
  if (!provider.fork) throw new Invalid(providerFeatureMissing(provider.label, "fork"));
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
    sandbox_enabled: chat.sandbox_enabled,
    edit_scope_enabled: chat.edit_scope_enabled,
    group_id: chat.group_id,
    worktree_path: chat.worktree_path,
  });
  store.events.copy(chat.id, forked.id, eventId);
  store.events.add(forked.id, { type: "notice", message: `「${chat.title}」のこの時点から分岐しました（ファイルの変更は戻していません）` });
  return store.chats.update(forked.id, { session_id: sessionId, branch: chat.branch, context_window: chat.context_window });
}
