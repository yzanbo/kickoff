import { createHash } from "node:crypto";
import path from "node:path";
import { resolveChatOptions } from "@shared/chat/chatOptions";
import type { ProviderId, ProviderSwitchPreview } from "@shared/types";
import type { Store } from "../db/store.js";
import { Conflict, NotFound } from "../http/errors.js";
import type { Runner } from "./runner.js";
import { workdirOf } from "./workdir.js";

/** 確認画面と確定時で同じ条件を比較する。資料や API キーはトークンに含めない。 */
export function providerSwitchPreview(store: Store, runner: Runner, chatId: number, target: ProviderId): ProviderSwitchPreview {
  const chat = store.chats.get(chatId);
  if (!chat) throw new NotFound("チャットが見つかりません");
  if (chat.archived_at || chat.provider === target || (chat.provider !== "claude" && chat.provider !== "codex") || (target !== "claude" && target !== "codex")) throw new Conflict("この AI には切り替えられません");
  if (store.chatProviderHandoffs.get(chatId)) throw new Conflict("前の AI の引き継ぎを確認してから切り替えてください");
  const project = store.projects.get(chat.project_id);
  if (!project) throw new NotFound("プロジェクトが見つかりません");
  const queue = runner.queueState(chatId);
  const cwd = path.resolve(workdirOf(chat, project));
  const busyChildren = store.chats.list({ projectId: chat.project_id }).filter((child) => child.parent_chat_id === chatId && path.resolve(workdirOf(child, project)) === cwd && runner.isBusy(child.id)).map((child) => child.id).sort((a, b) => a - b);
  const data = {
    chat_id: chatId, from: chat.provider, to: target,
    options: resolveChatOptions(store.settings.get(), target, project),
    queued_ids: queue.messages.map((message) => message.id), paused: queue.paused, stops: queue.stops,
    busy_child_ids: busyChildren, last_event_id: store.events.recent(chatId, 1)[0]?.id ?? null, workdir: cwd,
    sandbox_enabled: chat.sandbox_enabled, edit_scope_enabled: chat.edit_scope_enabled,
  };
  return { ...data, confirmation: createHash("sha256").update(JSON.stringify(data)).digest("hex") };
}
