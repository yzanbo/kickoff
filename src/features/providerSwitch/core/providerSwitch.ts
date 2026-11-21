import type { Chat } from "@shared/chat/types";
import type { ProviderId } from "@shared/settings/types";
import { resolveChatOptions } from "@shared/ai/chatOptions";
import { errorMessage } from "@shared/foundation/errors";
import type { SwitchStore } from "./store";
import type { UploadStore } from "@/features/attachments/core/uploads";
import { prepareProviderHandoff } from "./providerHandoffPrepare";
import { providerHandoffGit } from "./providerHandoffGit";
import { workdirOf } from "@/features/chat/core/workdir";
import { providerCan } from "@shared/ai/providers";

export interface ProviderSwitchDeps {
  store: SwitchStore;
  uploads: Pick<UploadStore, "save" | "resolve" | "remove">;
  /** 作業中や送信準備中なら例外にする。非同期の準備の前後で検査する。 */
  requireIdle: (chatId: number) => void;
  /** Git の状態の資料（投げない。取れなければ取れないと書いた資料を返す） */
  git?: typeof providerHandoffGit;
}

/**
 * 直近の会話と Git の状態を準備してから、担当 AI・区切り・次回送信用の文脈を原子的に保存する。
 * この関数自体は次の指示を送らない。画面・送信待ち・AI の実行への接続は呼び出し側の責務。
 */
export async function prepareAndCommitProviderSwitch(
  deps: ProviderSwitchDeps,
  input: { chatId: number; expectedProvider: ProviderId; target: ProviderId; queueWasPaused: boolean; queuedIds?: string[] },
): Promise<{ chat: Chat; warning: string | null }> {
  const { store, uploads } = deps;
  deps.requireIdle(input.chatId);
  const chat = store.chats.get(input.chatId);
  if (!chat || chat.archived_at || chat.provider !== input.expectedProvider || chat.provider === input.target) throw new Error("チャットの状態が変わったため、AI を切り替えられません");
  if (!providerCan(chat.provider, "switch") || !providerCan(input.target, "switch")) throw new Error("この AI の切り替えにはまだ対応していません");
  const project = store.projects.get(chat.project_id);
  if (!project) throw new Error("プロジェクトが見つかりません");
  const events = store.events.list(chat.id);
  const expectedLastEventId = events.at(-1)?.id ?? null;
  const previousTarget = store.chatProviderSessions.get(chat.id, input.target);
  const lastSwitch = events.findLastIndex((e) => e.type === "provider_switched");
  const lastCompleted = events.slice(lastSwitch + 1).findLast((e) => e.type === "result" && e.data.status === "completed" && e.data.session_id === chat.session_id);
  // いまの AI がまだ引き継ぎを受けていなければ、切り替えたときの位置（引き継ぎの保留が持つ）
  const pending = store.chatProviderHandoffs.get(chat.id);
  const oldCursor = pending?.provider === chat.provider ? pending.lastEventId : null;
  const currentLastEventId = lastCompleted?.id ?? oldCursor;
  let prepared: Awaited<ReturnType<typeof prepareProviderHandoff>> | null = null;
  let preparationError: string | null = null;
  try {
    prepared = await prepareProviderHandoff(uploads, chat.id, events, previousTarget?.last_event_id ?? 0);
  } catch (error) {
    preparationError = `会話の引き継ぎを準備できませんでした: ${errorMessage(error)}`;
  }
  const git = await (deps.git ?? providerHandoffGit)(workdirOf(chat, project));
  try {
    deps.requireIdle(input.chatId);
    const context = [prepared?.context, git.context].filter(Boolean).join("\n\n");
    const result = store.providerSwitch.commit({
      chatId: chat.id,
      expectedProvider: chat.provider,
      target: input.target,
      options: resolveChatOptions(store.settings.get(), input.target, project),
      context,
      state: preparationError ? "blocked" : "ready",
      error: preparationError,
      attachments: prepared?.created ?? [],
      queuedIds: input.queuedIds,
      expectedLastEventId,
      afterEventId: previousTarget?.last_event_id ?? null,
      currentLastEventId,
      queueWasPaused: input.queueWasPaused,
    });
    const missing = prepared?.missing.length ? `添付 ${prepared.missing.length} 件が見つかりません` : null;
    return { chat: result.chat, warning: [preparationError, git.warning, missing].filter(Boolean).join("。") || null };
  } catch (error) {
    await Promise.all((prepared?.created ?? []).map((file) => uploads.remove(file.id).catch(() => {})));
    throw error;
  }
}

/** 準備に失敗した切り替えを、切り替え時点までの記録から組み直す。ここでは指示を送らない。 */
export async function retryProviderHandoffPreparation(
  deps: ProviderSwitchDeps,
  chatId: number,
  claim = false,
): Promise<{ warning: string | null }> {
  const { store, uploads } = deps;
  deps.requireIdle(chatId);
  const chat = store.chats.get(chatId);
  const pending = store.chatProviderHandoffs.get(chatId);
  if (!chat || chat.archived_at || !pending || pending.state !== "blocked" || pending.provider !== chat.provider) throw new Error("再試行できる AI の引き継ぎがありません");
  const project = store.projects.get(chat.project_id);
  if (!project) throw new Error("プロジェクトが見つかりません");
  const events = store.events.list(chatId, { before: pending.eventId });
  const prepared = await prepareProviderHandoff(uploads, chatId, events, pending.lastEventId ?? 0);
  try {
    const git = await (deps.git ?? providerHandoffGit)(workdirOf(chat, project));
    deps.requireIdle(chatId);
    if (!store.providerSwitch.retry(chatId, pending.eventId, pending.provider, [prepared.context, git.context].filter(Boolean).join("\n\n"), prepared.created, claim)) throw new Error("AI の引き継ぎ状態が変わったため、再試行できません");
    const missing = prepared.missing.length ? `添付 ${prepared.missing.length} 件が見つかりません` : null;
    return { warning: [git.warning, missing].filter(Boolean).join("。") || null };
  } catch (error) {
    await Promise.all(prepared.created.map((file) => uploads.remove(file.id).catch(() => {})));
    throw error;
  }
}
