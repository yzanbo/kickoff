// AI の切り替えの保存（chat の店の操作と providerSwitch の 2 表を、土台の tx の 1 つのトランザクションで書く。chat の表を直の SQL で書かない）
import type { DatabaseSync } from "node:sqlite";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import type { Attachment, Chat, ChatOptions } from "@shared/chat/types";
import type { ProviderId } from "@shared/settings/types";
import type { Notify } from "@/foundation/core/db/common";
import { tx } from "@/foundation/core/db/tx";
import type { ChatStores, ChatStoreDeps } from "@/features/chat/core/index";
import { handoffBlocksSwitch } from "./db/handoffs";
import type { ProviderHandoffStores } from "./providerHandoffs";

/** 切り替えが読み書きする店（chat の店と、引き継ぎ・離れた AI のセッションの店） */
type ProviderSwitchDeps = Pick<ChatStores, "chats" | "events" | "logRevisions"> & ProviderHandoffStores;

export interface ProviderSwitchInput {
  chatId: number;
  expectedProvider: ProviderId;
  target: ProviderId;
  options: ChatOptions;
  context: string;
  state: "ready" | "blocked";
  error: string | null;
  attachments: Attachment[];
  queuedIds?: string[];
  expectedLastEventId: number | null;
  afterEventId: number | null;
  currentLastEventId: number | null;
  queueWasPaused: boolean;
}

/** 保存したあとの知らせ（知らせ先の失敗で、保存済みの操作を失敗扱いにしない。再試行による二重切り替えを防ぐ） */
function notifySafely(label: string, fn: () => void) {
  try {
    fn();
  } catch (error) {
    console.warn(`[${label}] 保存後の通知に失敗しました`, error);
  }
}

export function createProviderSwitchStore(db: DatabaseSync, onChange: Notify, s: ProviderSwitchDeps) {
  return {
    /**
     * AI の切り替え・区切り・次の指示用の文脈を 1 つのトランザクションで保存する。
     * 実行前の作業中・確認画面との競合は呼び出し側も検査する。失敗時に途中の状態を残さない。
     */
    commit(input: ProviderSwitchInput): { chat: Chat; event: ChatEventOf<"provider_switched"> } {
      const { eventId, superseded } = tx(
        db,
        () => {
          const current = s.chats.get(input.chatId);
          if (!current || current.archived_at || current.status === "running" || current.provider !== input.expectedProvider || current.provider === input.target) throw new Error("チャットの状態が変わったため、AI を切り替えられません");
          if (s.events.latestId(current.id) !== input.expectedLastEventId) throw new Error("会話が変わったため、AI を切り替えられません");
          const pending = s.chatProviderHandoffs.get(current.id);
          const blocked = handoffBlocksSwitch(pending, current.provider);
          if (blocked) throw new Error(blocked);
          // 送る前に替え直したので、前の区切りの資料は渡していない印を付ける（引き継ぎ内容の表示で区別する）
          if (pending) s.events.patchData(current.id, pending.eventId, "provider_switched", { handoff_status: "superseded" });
          // いまの AI のセッションは chats.session_id だけが持つ: 離れる AI の分を覚えに書き、戻る AI の分は覚えから読んで消す
          if (current.session_id) s.chatProviderSessions.save(current.id, current.provider, current.session_id, input.currentLastEventId);
          const targetSession = s.chatProviderSessions.get(current.id, input.target);
          if (targetSession) s.chatProviderSessions.remove(current.id, input.target);
          const id = s.events.write(current.id, {
            type: "provider_switched",
            from: current.provider,
            to: input.target,
            handoff_context: input.context,
            handoff_status: input.state,
            ...(input.attachments.length ? { handoff_attachments: input.attachments } : {}),
            ...(input.queuedIds?.length ? { queued_ids: input.queuedIds } : {}),
          });
          s.chatProviderHandoffs.save({ chatId: current.id, eventId: id, provider: input.target, context: input.context, state: input.state, error: input.error, lastEventId: input.afterEventId, queueWasPaused: input.queueWasPaused });
          const { model, effort, permission_mode, fast_mode } = input.options;
          s.chats.write(current.id, { provider: input.target, session_id: targetSession?.session_id ?? null, model, effort, permission_mode, fast_mode, context_tokens: null, context_window: null });
          return { eventId: id, superseded: pending !== undefined };
        },
        "immediate",
      );
      if (superseded) notifySafely("provider-switch", () => s.logRevisions.changed(input.chatId));
      const chat = s.chats.get(input.chatId)!;
      const event = s.events.get(eventId)! as ChatEventOf<"provider_switched">;
      for (const change of [{ type: "chat", chat } as const, { type: "chat_event", project_id: chat.project_id, event } as const]) notifySafely("provider-switch", () => onChange(change));
      return { chat, event };
    },

    /** 引き継ぎを使った作業が完了したら、区切りの印と保留の解除をまとめて行う（再開位置はその作業の result。いまの AI のセッションは chats.session_id）。 */
    complete(chatId: number, eventId: number, provider: ProviderId, sessionId: string): boolean {
      return tx(
        db,
        () => {
          const current = s.chats.get(chatId);
          const pending = s.chatProviderHandoffs.get(chatId);
          if (!current || current.provider !== provider || current.session_id !== sessionId || !pending || pending.eventId !== eventId || pending.provider !== provider || pending.state !== "sending") return false;
          s.events.patchData(chatId, eventId, "provider_switched", { handoff_status: "delivered" });
          if (!s.chatProviderHandoffs.complete(chatId, eventId)) throw new Error("AI の引き継ぎ状態が変わりました");
          return true;
        },
        "immediate",
      );
    },

    /** 再開前に対象セッションの消失が確定した場合だけ、再開位置を外して資料の再準備を待つ。 */
    markSessionMissing(chatId: number, eventId: number, provider: ProviderId, sessionId: string): boolean {
      const changed = tx(
        db,
        () => {
          const chat = s.chats.get(chatId);
          const pending = s.chatProviderHandoffs.get(chatId);
          if (!chat || chat.provider !== provider || chat.session_id !== sessionId || !pending || pending.eventId !== eventId || pending.provider !== provider || pending.state !== "sending") return false;
          s.chats.write(chatId, { session_id: null });
          s.chatProviderHandoffs.save({ ...pending, state: "blocked", error: "以前のセッションが見つからないため、会話の資料を作り直します", lastEventId: null });
          return true;
        },
        "immediate",
      );
      if (!changed) return false;
      const chat = s.chats.get(chatId)!;
      notifySafely("provider-handoff", () => onChange({ type: "chat", chat }));
      return true;
    },

    /** 準備をやり直した資料と、その参照先を同時に保存する。別の切り替えや送信と競合したら変更しない。 */
    retry(chatId: number, eventId: number, provider: ProviderId, context: string, attachments: Attachment[], claim = false): boolean {
      const changed = tx(
        db,
        () => {
          const chat = s.chats.get(chatId);
          const pending = s.chatProviderHandoffs.get(chatId);
          const event = s.events.get(eventId);
          if (!chat || chat.archived_at || chat.provider !== provider || !pending || pending.eventId !== eventId || pending.provider !== provider || pending.state !== "blocked" || !event || event.chat_id !== chatId || event.type !== "provider_switched") return false;
          const previous = event.data.handoff_attachments ?? [];
          s.events.patchData(chatId, eventId, "provider_switched", { handoff_context: context, handoff_status: "ready", handoff_attachments: [...previous, ...attachments] });
          s.chatProviderHandoffs.save({ ...pending, context, state: claim ? "sending" : "ready", error: null });
          return true;
        },
        "immediate",
      );
      if (!changed) return false;
      notifySafely("provider-handoff", () => s.logRevisions.changed(chatId));
      const chat = s.chats.get(chatId)!;
      const event = s.events.get(eventId)!;
      notifySafely("provider-handoff", () => onChange({ type: "chat_event", project_id: chat.project_id, event }));
      return true;
    },
  };
}

export type ProviderSwitchStore = ReturnType<typeof createProviderSwitchStore>;

/** 切り替えの手順が読み書きする店（chat の店の束・引き継ぎの店・切り替えのトランザクション） */
export type SwitchStore = Pick<ChatStoreDeps, "chats" | "events" | "settings" | "projects"> & ProviderHandoffStores & { providerSwitch: ProviderSwitchStore };
