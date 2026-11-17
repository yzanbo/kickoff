import type { Chat, ProviderId } from "@shared/types";
import { resolveChatOptions } from "@shared/chat/chatOptions";
import { errorMessage } from "@shared/errors";
import type { Store } from "../db/store.js";
import type { UploadStore } from "./uploads.js";
import { prepareProviderHandoff } from "./providerHandoffPrepare.js";
import { providerHandoffGit } from "./providerHandoffGit.js";
import { workdirOf } from "./workdir.js";

export interface ProviderSwitchDeps {
  store: Store;
  uploads: Pick<UploadStore, "save" | "resolve" | "remove">;
  /** 作業中や送信準備中なら例外にする。非同期の準備の前後で検査する。 */
  requireIdle: (chatId: number) => void;
  git?: typeof providerHandoffGit;
}

/**
 * 直近の会話と Git の状態を準備してから、担当 AI・区切り・次回送信用の文脈を原子的に保存する。
 * この関数自体は次の指示を送らない。画面・送信待ち・AI の実行への接続は呼び出し側の責務。
 */
export async function prepareAndCommitProviderSwitch(
  deps: ProviderSwitchDeps,
  input: { chatId: number; expectedProvider: ProviderId; target: ProviderId; queueWasPaused: boolean },
): Promise<{ chat: Chat; warning: string | null }> {
  const { store, uploads } = deps;
  deps.requireIdle(input.chatId);
  const chat = store.chats.get(input.chatId);
  if (!chat || chat.archived_at || chat.provider !== input.expectedProvider || chat.provider === input.target) throw new Error("チャットの状態が変わったため、AI を切り替えられません");
  if ((chat.provider !== "claude" && chat.provider !== "codex") || (input.target !== "claude" && input.target !== "codex")) throw new Error("この AI の切り替えにはまだ対応していません");
  const project = store.projects.get(chat.project_id);
  if (!project) throw new Error("プロジェクトが見つかりません");
  const events = store.events.list(chat.id);
  const expectedLastEventId = events.at(-1)?.id ?? null;
  const previousTarget = store.chatProviderSessions.get(chat.id, input.target);
  const lastSwitch = events.findLastIndex((e) => e.type === "provider_switched");
  const lastCompleted = events.slice(lastSwitch + 1).findLast((e) => e.type === "result" && e.data.status === "completed" && e.data.session_id === chat.session_id);
  const oldCursor = store.chatProviderSessions.get(chat.id, chat.provider)?.last_event_id ?? null;
  const currentLastEventId = lastCompleted?.id ?? oldCursor;
  let prepared: Awaited<ReturnType<typeof prepareProviderHandoff>> | null = null;
  let preparationError: string | null = null;
  try {
    prepared = await prepareProviderHandoff(uploads, chat.id, events, previousTarget?.last_event_id ?? 0);
  } catch (error) {
    preparationError = `会話の引き継ぎを準備できませんでした: ${errorMessage(error)}`;
  }
  const git = await (deps.git ?? providerHandoffGit)(workdirOf(chat, project)).catch(() => ({ context: "作業場所の Git の状態を取得できませんでした。", warning: "Git の状態を取得できませんでした" }));
  try {
    deps.requireIdle(input.chatId);
    const context = [prepared?.context, git.context].filter(Boolean).join("\n\n");
    const result = store.commitProviderSwitch({
      chatId: chat.id,
      expectedProvider: chat.provider,
      target: input.target,
      options: resolveChatOptions(store.settings.get(), input.target, project),
      context,
      state: preparationError ? "blocked" : "ready",
      error: preparationError,
      attachments: prepared?.created ?? [],
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
