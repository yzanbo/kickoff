import type { DatabaseSync } from "node:sqlite";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import type { Attachment, Chat, ChatOptions } from "@shared/chat/types";
import type { ProviderId } from "@shared/settings/types";
import type { Notify } from "@/foundation/core/db/common";
import { tx } from "@/foundation/core/db/tx";
import type { createChatProviderSessionStore } from "./chatProviderSessions";
import type { createChatStore } from "./chats";
import type { createEventStore } from "./events";
import type { LogRevisions } from "./logRevisions";

/** ready = 次の指示に添える、blocked = 準備失敗、sending = 送信開始、uncertain = 受信されたか不明。 */
type HandoffState = "ready" | "blocked" | "sending" | "uncertain";
export interface ChatProviderHandoff {
  chatId: number;
  eventId: number;
  provider: ProviderId;
  context: string;
  state: HandoffState;
  error: string | null;
  lastEventId: number | null;
  queueWasPaused: boolean;
}

/**
 * 保留中の引き継ぎが、次の AI の切り替えを止めるか。止めるならその理由の文。
 * まだ何も送っていない準備済み（ready）のものは、次の切り替えで置き換えてよい（切り替えたあと送る前に戻す・替え直すため）。
 * 準備の失敗・送信中・受信不明は、指示を失わない・二重に送らないよう、片付くまで切り替えない。
 */
export function handoffBlocksSwitch(pending: ChatProviderHandoff | undefined, currentProvider: ProviderId): string | null {
  if (!pending) return null;
  if (pending.state === "ready" && pending.provider === currentProvider) return null;
  if (pending.state === "blocked") return "引き継ぎを準備できていません。先に再試行してから切り替えてください";
  if (pending.state === "uncertain") return "AI が指示を受け取ったか確認できていません。確認してから切り替えてください";
  return "引き継ぎを送っている途中です。終わってから切り替えてください";
}

interface HandoffRow {
  chat_id: number;
  event_id: number;
  provider: ProviderId;
  context: string;
  state: HandoffState;
  error: string | null;
  last_event_id: number | null;
  queue_was_paused: number;
}
const fromRow = (r: HandoffRow): ChatProviderHandoff => ({ chatId: r.chat_id, eventId: r.event_id, provider: r.provider, context: r.context, state: r.state, error: r.error, lastEventId: r.last_event_id, queueWasPaused: r.queue_was_paused === 1 });

/** この保存先だけでは送信・再試行を開始しない。 */
export function createChatProviderHandoffStore(db: DatabaseSync) {
  return {
    get(chatId: number): ChatProviderHandoff | undefined {
      const row = db.prepare("SELECT * FROM chat_provider_handoffs WHERE chat_id = ?").get(chatId) as unknown as HandoffRow | undefined;
      return row ? fromRow(row) : undefined;
    },
    save(handoff: ChatProviderHandoff): void {
      db.prepare(`INSERT INTO chat_provider_handoffs (chat_id, event_id, provider, context, state, error, last_event_id, queue_was_paused)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET event_id = excluded.event_id,
        provider = excluded.provider, context = excluded.context, state = excluded.state, error = excluded.error,
        last_event_id = excluded.last_event_id, queue_was_paused = excluded.queue_was_paused`).run(
        handoff.chatId, handoff.eventId, handoff.provider, handoff.context, handoff.state, handoff.error, handoff.lastEventId, handoff.queueWasPaused ? 1 : 0,
      );
    },
    remove(chatId: number): void {
      db.prepare("DELETE FROM chat_provider_handoffs WHERE chat_id = ?").run(chatId);
    },
    /** 実行の直前に 1 回だけ送信中へ進める。別の操作や古い区切りは競合として失敗する。 */
    claim(chatId: number, eventId: number, provider: ProviderId): boolean {
      return db.prepare("UPDATE chat_provider_handoffs SET state = 'sending', error = NULL WHERE chat_id = ? AND event_id = ? AND provider = ? AND state = 'ready'").run(chatId, eventId, provider).changes === 1;
    },
    /** AI を起動する前に準備が失敗した場合は、再試行を待つ。 */
    blockReady(chatId: number, eventId: number, error: string): boolean {
      return db.prepare("UPDATE chat_provider_handoffs SET state = 'blocked', error = ? WHERE chat_id = ? AND event_id = ? AND state = 'ready'").run(error, chatId, eventId).changes === 1;
    },
    /** 送信中の印を先に取ったものの、AI を呼ぶ前に止まったと確実な場合だけ戻す。 */
    blockBeforeSend(chatId: number, eventId: number, error: string): boolean {
      return db.prepare("UPDATE chat_provider_handoffs SET state = 'blocked', error = ? WHERE chat_id = ? AND event_id = ? AND state = 'sending'").run(error, chatId, eventId).changes === 1;
    },
    /** 送信後の状態が分からない場合は自動再送しない。 */
    markUncertain(chatId: number, eventId: number, error: string): boolean {
      return db.prepare("UPDATE chat_provider_handoffs SET state = 'uncertain', error = ? WHERE chat_id = ? AND event_id = ? AND state = 'sending'").run(error, chatId, eventId).changes === 1;
    },
    /** 受信不明の再送は利用者が明示した場合に限る。まず blocked に戻し、資料を作り直してから送る。 */
    confirmResend(chatId: number, eventId: number): boolean {
      return db.prepare("UPDATE chat_provider_handoffs SET state = 'blocked', error = ? WHERE chat_id = ? AND event_id = ? AND state = 'uncertain'").run("利用者が再送を選びました。引き継ぎを準備します。", chatId, eventId).changes === 1;
    },
    /** 同じ切り替えの送信が無事に完了した場合だけ、保留を外す。 */
    complete(chatId: number, eventId: number): boolean {
      return db.prepare("DELETE FROM chat_provider_handoffs WHERE chat_id = ? AND event_id = ? AND state = 'sending'").run(chatId, eventId).changes === 1;
    },
    /** 前回の終了時に送信中だったものは、起動後に受信不明として利用者の確認を待つ。 */
    recoverInterrupted(): number {
      return Number(db.prepare("UPDATE chat_provider_handoffs SET state = 'uncertain', error = ? WHERE state = 'sending'").run("前回の終了時に送信中だったため、AI が指示を受け取ったか確認できません").changes);
    },
  };
}

// AI の切り替えの保存（chats・chat_events・providerSwitch の 2 表を 1 つのトランザクションで書く）。
// 仮に chat の中に置く（切り替えの表の持ち主 providerSwitch の店へ移すまで）

/** 切り替えが読み書きする chat の店 */
interface ProviderSwitchDeps {
  chats: ReturnType<typeof createChatStore>;
  events: ReturnType<typeof createEventStore>;
  chatProviderSessions: ReturnType<typeof createChatProviderSessionStore>;
  chatProviderHandoffs: ReturnType<typeof createChatProviderHandoffStore>;
  logRevisions: LogRevisions;
}

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
          if (pending) db.prepare("UPDATE chat_events SET data = json_set(data, '$.handoff_status', 'superseded') WHERE id = ? AND chat_id = ? AND type = 'provider_switched'").run(pending.eventId, current.id);
          // いまの AI のセッションは chats.session_id だけが持つ: 離れる AI の分を覚えに書き、戻る AI の分は覚えから読んで消す
          if (current.session_id) s.chatProviderSessions.save(current.id, current.provider, current.session_id, input.currentLastEventId);
          const targetSession = s.chatProviderSessions.get(current.id, input.target);
          if (targetSession) s.chatProviderSessions.remove(current.id, input.target);
          const inserted = db.prepare("INSERT INTO chat_events (chat_id, type, data) VALUES (?, 'provider_switched', ?)").run(
            current.id,
            JSON.stringify({ from: current.provider, to: input.target, handoff_context: input.context, handoff_status: input.state, ...(input.attachments.length ? { handoff_attachments: input.attachments } : {}), ...(input.queuedIds?.length ? { queued_ids: input.queuedIds } : {}) }),
          );
          const id = Number(inserted.lastInsertRowid);
          s.chatProviderHandoffs.save({ chatId: current.id, eventId: id, provider: input.target, context: input.context, state: input.state, error: input.error, lastEventId: input.afterEventId, queueWasPaused: input.queueWasPaused });
          db.prepare(`UPDATE chats SET provider = ?, session_id = ?, model = ?, effort = ?, permission_mode = ?, fast_mode = ?, context_tokens = NULL, context_window = NULL WHERE id = ?`).run(
            input.target, targetSession?.session_id ?? null, input.options.model, input.options.effort, input.options.permission_mode, input.options.fast_mode ? 1 : 0, current.id,
          );
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
          db.prepare("UPDATE chat_events SET data = json_set(data, '$.handoff_status', 'delivered') WHERE id = ? AND chat_id = ? AND type = 'provider_switched'").run(eventId, chatId);
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
          db.prepare("UPDATE chats SET session_id = NULL WHERE id = ?").run(chatId);
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
          const data = { ...event.data, handoff_context: context, handoff_status: "ready", handoff_attachments: [...previous, ...attachments] };
          db.prepare("UPDATE chat_events SET data = ? WHERE id = ? AND chat_id = ?").run(JSON.stringify(data), eventId, chatId);
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
