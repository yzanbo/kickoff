import type { DatabaseSync } from "node:sqlite";
import { createChatStore } from "@/features/chat/core/db/chats";
import { createChatProviderSessionStore } from "@/features/chat/core/db/chatProviderSessions";
import { createChatProviderHandoffStore, handoffBlocksSwitch } from "@/features/chat/core/db/chatProviderHandoffs";
import { createChatImageStore } from "@/features/remoteImages/core/db/chatImages";
import type { Notify } from "./common";
import { createDbConnectionStore } from "@/features/database/core/db/dbConnections";
import { createDbErLayoutStore } from "@/features/database/core/db/dbErLayouts";
import { createDbQueryHistoryStore } from "@/features/database/core/db/dbQueryHistory";
import { createDbPrepRunStore } from "@/features/database/core/db/dbPrepRuns";
import { createDeviceStore } from "@/features/devices/core/db/devices";
import { createEventStore } from "@/features/chat/core/db/events";
import { createGroupStore } from "@/features/groups/core/db/groups";
import { createLogRevisions, type LogRevisions } from "@/features/chat/core/db/logRevisions";
import { openDatabase } from "./open";
import { createPrNoticeStore } from "@/features/github/core/db/prNotices";
import { createCiNoticeStore } from "@/features/github/core/db/ciNotices";
import { createProjectStore } from "@/features/projects/core/db/projects";
import { createQueueStore } from "@/features/chat/core/db/queues";
import { createSecretStore, createSettingsStore, readDatabaseId } from "@/foundation/core/settings/settings";
import { createSnippetStore } from "@/features/snippets/core/db/snippets";
import { databaseStats, type DatabaseStats } from "./stats";
import { createTrashStore } from "@/features/trash/core/db/trash";
import { createAgentSessionStore } from "@/features/chat/core/db/agentSessions";
import { createWorktreeEnvStore } from "@/features/worktrees/core/db/worktreeEnvs";
import { createWorktreeColorStore } from "@/features/worktrees/core/db/worktreeColors";
import type { Attachment, Chat, ChatEventOf, ChatOptions, ProviderId } from "@shared/types";

/**
 * SQLite の永続化層。表ごとの店（store.chats.get など）をまとめて持つ。変更系の操作は onChange で知らせる
 * （画面・スマホへのリアルタイムの配信はこの知らせを起点にする）
 */
export class Store {
  readonly db: DatabaseSync;
  /** この DB を作ったときに決めた ID（meta の表）。スマホ連携の本体の ID（スマホが複数の本体を切り替える目印）も兼ねる */
  readonly databaseId: string;
  readonly settings;
  readonly secrets;
  readonly projects;
  readonly groups;
  readonly chats;
  readonly chatProviderSessions;
  readonly chatProviderHandoffs;
  readonly events;
  readonly queues;
  readonly snippets;
  /** ワークツリーの PR の知らせで、確認を閉じた PR */
  readonly prNotices;
  /** チャット欄の外の画像（表示を許可したホストと、取ってきた画像の覚え書き。v32） */
  readonly chatImages;
  /** CI の失敗を知らせた実行（同じ実行を知らせ直さない） */
  readonly ciNotices;
  /** DB クライアントの接続（プロジェクトごと。パスワードは secrets） */
  readonly dbConnections;
  readonly dbQueryHistory;
  readonly dbErLayouts;
  readonly dbPrepRuns;
  /** ワークツリーの実行環境（ポートの帯・組の名前） */
  readonly worktreeEnvs;
  /** ワークツリーの色（作業するフォルダごとに、初めて見たときに決めた色相） */
  readonly worktreeColors;
  /** スマホ連携の端末（トークンの hash・最後に使った時刻・プッシュの宛先） */
  readonly devices;
  /** Kickoff のゴミ箱（消したものを 3 日だけ取っておく。中身のファイルは trash/TrashService が置き場に置く） */
  readonly trash;
  /** Kickoff が作ったセッション（Claude Code の会話記録）の覚え（使われなくなったらゴミ箱へ。trash/sessionTrash.ts） */
  readonly agentSessions;
  /** 記録を足す以外の形で変えた知らせ（巻き戻し・セッションの付け替え・チャットの削除。コアの索引の覚えを捨てる合図） */
  readonly logRevisions: LogRevisions = createLogRevisions();

  constructor(
    private readonly file: string,
    private readonly onChange: Notify = () => {},
  ) {
    this.db = openDatabase(file);
    this.databaseId = readDatabaseId(this.db);
    this.settings = createSettingsStore(this.db, onChange);
    this.secrets = createSecretStore(this.db);
    this.projects = createProjectStore(this.db, onChange);
    this.chats = createChatStore(this.db, onChange, this.logRevisions, this.settings.get);
    this.chatProviderSessions = createChatProviderSessionStore(this.db);
    this.chatProviderHandoffs = createChatProviderHandoffStore(this.db);
    this.groups = createGroupStore(this.db, onChange, this.chats.get);
    this.events = createEventStore(this.db, onChange, this.chats.get, this.logRevisions);
    this.queues = createQueueStore(this.db);
    this.snippets = createSnippetStore(this.db, onChange);
    this.prNotices = createPrNoticeStore(this.db);
    this.chatImages = createChatImageStore(this.db);
    this.ciNotices = createCiNoticeStore(this.db);
    this.dbConnections = createDbConnectionStore(this.db, onChange, this.secrets);
    this.dbQueryHistory = createDbQueryHistoryStore(this.db);
    this.dbErLayouts = createDbErLayoutStore(this.db);
    this.dbPrepRuns = createDbPrepRunStore(this.db);
    this.worktreeEnvs = createWorktreeEnvStore(this.db);
    this.worktreeColors = createWorktreeColorStore(this.db);
    this.devices = createDeviceStore(this.db);
    this.trash = createTrashStore(this.db, onChange);
    this.agentSessions = createAgentSessionStore(this.db);
  }

  /**
   * AI の切り替え・区切り・次の指示用の文脈を 1 つのトランザクションで保存する。
   * 実行前の作業中・確認画面との競合は呼び出し側も検査する。失敗時に途中の状態を残さない。
   */
  commitProviderSwitch(input: {
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
  }): { chat: Chat; event: ChatEventOf<"provider_switched"> } {
    this.db.exec("BEGIN IMMEDIATE");
    let eventId: number;
    let supersededEventId: number | null = null;
    try {
      const current = this.chats.get(input.chatId);
      if (!current || current.archived_at || current.status === "running" || current.provider !== input.expectedProvider || current.provider === input.target) throw new Error("チャットの状態が変わったため、AI を切り替えられません");
      const latest = this.db.prepare("SELECT MAX(id) AS id FROM chat_events WHERE chat_id = ?").get(current.id) as { id: number | null };
      if (latest.id !== input.expectedLastEventId) throw new Error("会話が変わったため、AI を切り替えられません");
      const superseded = this.chatProviderHandoffs.get(current.id);
      const blocked = handoffBlocksSwitch(superseded, current.provider);
      if (blocked) throw new Error(blocked);
      // 送る前に替え直したので、前の区切りの資料は渡していない印を付ける（引き継ぎ内容の表示で区別する）
      supersededEventId = superseded?.eventId ?? null;
      if (superseded) this.db.prepare("UPDATE chat_events SET data = json_set(data, '$.handoff_status', 'superseded') WHERE id = ? AND chat_id = ? AND type = 'provider_switched'").run(superseded.eventId, current.id);
      if (current.session_id) this.chatProviderSessions.save(current.id, current.provider, current.session_id, input.currentLastEventId);
      const targetSession = this.chatProviderSessions.get(current.id, input.target);
      const inserted = this.db.prepare("INSERT INTO chat_events (chat_id, type, data) VALUES (?, 'provider_switched', ?)").run(
        current.id,
        JSON.stringify({ from: current.provider, to: input.target, handoff_context: input.context, handoff_status: input.state, ...(input.attachments.length ? { handoff_attachments: input.attachments } : {}), ...(input.queuedIds?.length ? { queued_ids: input.queuedIds } : {}) }),
      );
      eventId = Number(inserted.lastInsertRowid);
      this.chatProviderHandoffs.save({ chatId: current.id, eventId, provider: input.target, context: input.context, state: input.state, error: input.error, lastEventId: input.afterEventId, queueWasPaused: input.queueWasPaused });
      this.db.prepare(`UPDATE chats SET provider = ?, session_id = ?, model = ?, effort = ?, permission_mode = ?, fast_mode = ?, context_tokens = NULL, context_window = NULL WHERE id = ?`).run(
        input.target, targetSession?.session_id ?? null, input.options.model, input.options.effort, input.options.permission_mode, input.options.fast_mode ? 1 : 0, current.id,
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (supersededEventId !== null) {
      try { this.logRevisions.changed(input.chatId); } catch (error) { console.warn("[provider-switch] 記録の更新通知に失敗しました", error); }
    }
    const chat = this.chats.get(input.chatId)!;
    const event = this.events.get(eventId)! as ChatEventOf<"provider_switched">;
    // 通知先の失敗で、保存済みの操作を失敗扱いにしない（再試行による二重切り替えを防ぐ）。
    for (const change of [{ type: "chat", chat } as const, { type: "chat_event", project_id: chat.project_id, event } as const]) {
      try { this.onChange(change); } catch (error) { console.warn("[provider-switch] 保存後の通知に失敗しました", error); }
    }
    return { chat, event };
  }

  /** 引き継ぎを使った作業が完了したら、再開位置の更新と保留の解除をまとめて行う。 */
  completeProviderHandoff(chatId: number, eventId: number, provider: ProviderId, sessionId: string, lastEventId: number): boolean {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.chats.get(chatId);
      const pending = this.chatProviderHandoffs.get(chatId);
      if (!current || current.provider !== provider || current.session_id !== sessionId || !pending || pending.eventId !== eventId || pending.provider !== provider || pending.state !== "sending") {
        this.db.exec("ROLLBACK");
        return false;
      }
      this.chatProviderSessions.save(chatId, provider, sessionId, lastEventId);
      this.db.prepare("UPDATE chat_events SET data = json_set(data, '$.handoff_status', 'delivered') WHERE id = ? AND chat_id = ? AND type = 'provider_switched'").run(eventId, chatId);
      if (!this.chatProviderHandoffs.complete(chatId, eventId)) throw new Error("AI の引き継ぎ状態が変わりました");
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** 再開前に対象セッションの消失が確定した場合だけ、再開位置を外して資料の再準備を待つ。 */
  markProviderSessionMissing(chatId: number, eventId: number, provider: ProviderId, sessionId: string): boolean {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const chat = this.chats.get(chatId);
      const pending = this.chatProviderHandoffs.get(chatId);
      if (!chat || chat.provider !== provider || chat.session_id !== sessionId || !pending || pending.eventId !== eventId || pending.provider !== provider || pending.state !== "sending") {
        this.db.exec("ROLLBACK");
        return false;
      }
      this.db.prepare("UPDATE chats SET session_id = NULL WHERE id = ?").run(chatId);
      this.chatProviderSessions.remove(chatId, provider);
      this.chatProviderHandoffs.save({ ...pending, state: "blocked", error: "以前のセッションが見つからないため、会話の資料を作り直します", lastEventId: null });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const chat = this.chats.get(chatId)!;
    try { this.onChange({ type: "chat", chat }); } catch (error) { console.warn("[provider-handoff] セッション変更の通知に失敗しました", error); }
    return true;
  }

  /** 準備をやり直した資料と、その参照先を同時に保存する。別の切り替えや送信と競合したら変更しない。 */
  retryProviderHandoff(chatId: number, eventId: number, provider: ProviderId, context: string, attachments: Attachment[], claim = false): boolean {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const chat = this.chats.get(chatId);
      const pending = this.chatProviderHandoffs.get(chatId);
      const event = this.events.get(eventId);
      if (!chat || chat.archived_at || chat.provider !== provider || !pending || pending.eventId !== eventId || pending.provider !== provider || pending.state !== "blocked" || !event || event.chat_id !== chatId || event.type !== "provider_switched") {
        this.db.exec("ROLLBACK");
        return false;
      }
      const previous = event.data.handoff_attachments ?? [];
      const data = { ...event.data, handoff_context: context, handoff_status: "ready", handoff_attachments: [...previous, ...attachments] };
      this.db.prepare("UPDATE chat_events SET data = ? WHERE id = ? AND chat_id = ?").run(JSON.stringify(data), eventId, chatId);
      this.chatProviderHandoffs.save({ ...pending, context, state: claim ? "sending" : "ready", error: null });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    try { this.logRevisions.changed(chatId); } catch (error) { console.warn("[provider-handoff] 記録の更新通知に失敗しました", error); }
    const chat = this.chats.get(chatId)!;
    const event = this.events.get(eventId)!;
    try { this.onChange({ type: "chat_event", project_id: chat.project_id, event }); } catch (error) { console.warn("[provider-handoff] 保存後の通知に失敗しました", error); }
    return true;
  }

  /** 性能の記録（診断）に載せる DB の様子（ファイルの大きさ・チャットと記録の数・記録の多いチャット） */
  stats(): DatabaseStats {
    return databaseStats(this.db, this.file);
  }

  close() {
    this.db.close();
  }
}
