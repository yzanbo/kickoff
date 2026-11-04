import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./open.js";
import type { Notify } from "./common.js";
import { createGroupStore } from "./groups.js";
import { createProjectStore, type ProjectPatch } from "./projects.js";
import { createQueueStore, type SavedQueue } from "./queues.js";
import { createChatStore, type ChatFilter, type ChatPatch } from "./chats.js";
import { createSettingsStore, type SecretKey } from "./settings.js";
import type {
  AppSettings,
  NewProject,
  NewChat,
  Project,
  ProjectSummary,
  Chat,
  ChatEvent,
  ChatEventData,
  ChatGroup,
  SearchHit,
} from "@shared/types";

/**
 * SQLite の永続化層。変更系メソッドは onChange でイベントを通知する
 * （UI やモバイルへのリアルタイム配信はこの通知を起点にする）。
 * 中身は db/ に表ごとに分けてあり、ここは同じ名前で委譲する入口
 */
export class Store {
  readonly db: DatabaseSync;
  private readonly settings;
  private readonly projects;
  private readonly chats;
  private readonly groups;
  private readonly queues;

  constructor(file: string, onChange: Notify = () => {}) {
    this.db = openDatabase(file);
    this.settings = createSettingsStore(this.db, onChange);
    this.projects = createProjectStore(this.db, onChange);
    this.chats = createChatStore(this.db, onChange);
    this.groups = createGroupStore(this.db, onChange, this.chats.get);
    this.queues = createQueueStore(this.db);
  }

  close() {
    this.db.close();
  }

  // ---- 設定（db/settings.ts） ----

  getSettings(): AppSettings {
    return this.settings.get();
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    return this.settings.update(patch);
  }

  /** API キーなどの秘密の値（設定の一覧・画面への配信には含めない） */
  getSecret(key: SecretKey): string | null {
    return this.settings.secret(key);
  }

  setSecret(key: SecretKey, value: string) {
    this.settings.setSecret(key, value);
  }

  // ---- プロジェクト（db/projects.ts） ----

  listProjects(): ProjectSummary[] {
    return this.projects.list();
  }

  findProjectByPath(repoPath: string): Project | undefined {
    return this.projects.findByPath(repoPath);
  }

  getProject(id: number): Project | undefined {
    return this.projects.get(id);
  }

  createProject(input: NewProject): Project {
    return this.projects.create(input);
  }

  updateProject(id: number, patch: ProjectPatch): Project {
    return this.projects.update(id, patch);
  }

  /** サイドバーでのプロジェクトの並び順を ids の順にする */
  reorderProjects(ids: number[]) {
    this.projects.reorder(ids);
  }

  deleteProject(id: number) {
    this.projects.delete(id);
  }

  // ---- チャット（エージェントとの会話セッション。db/chats.ts） ----

  listChats(filter: ChatFilter = {}): Chat[] {
    return this.chats.list(filter);
  }

  getChat(id: number): Chat | undefined {
    return this.chats.get(id);
  }

  createChat(input: NewChat): Chat {
    return this.chats.create(input);
  }

  updateChat(id: number, patch: ChatPatch): Chat {
    return this.chats.update(id, patch);
  }

  /** チャットを完全に削除する（会話の記録も消える） */
  deleteChat(id: number) {
    this.chats.delete(id);
  }

  /** 未読の印を付ける・外す。最後に動いた時刻（一覧の並び順）は変えない */
  setChatUnread(id: number, unread: boolean): Chat {
    return this.chats.setUnread(id, unread);
  }

  /** サイドバーの上に固定する・やめる（最後に動いた時刻（並び順）は変えない） */
  setChatPinned(id: number, pinned: boolean): Chat {
    return this.chats.setPinned(id, pinned);
  }

  /** チャットをグループへ移す（null でグループから外す）。並び順が変わらないよう更新日時は進めない */
  setChatGroup(id: number, groupId: number | null): Chat {
    return this.chats.setGroup(id, groupId);
  }

  /** チャットを別のプロジェクトへ移す（グループ・作業場所・ブランチは外す。並び順は変えない） */
  moveChat(id: number, projectId: number): Chat {
    return this.chats.move(id, projectId);
  }

  /** 完了したまま days 日たったチャットをアーカイブする（自動のアーカイブ）。アーカイブした数を返す */
  archiveStaleChats(days: number, now = new Date()): number {
    return this.chats.archiveStale(days, now);
  }

  /** その作業場所（ワークツリー）を使っているチャット */
  chatsInWorktree(projectId: number, worktreePath: string): Chat[] {
    return this.chats.inWorktree(projectId, worktreePath);
  }

  /** ワークツリーを片付けたあと、そこで作業していたチャットの作業場所を本体に戻す（並び順は変えない） */
  clearChatWorktree(projectId: number, worktreePath: string): void {
    this.chats.clearWorktree(projectId, worktreePath);
  }

  latestUnreadEventId(chatId: number): number {
    return this.chats.latestUnreadEventId(chatId);
  }

  addEvent(chatId: number, event: ChatEventData): ChatEvent {
    return this.chats.addEvent(chatId, event);
  }

  /** 会話の記録を、別のチャットへ upToEventId まで写す（時刻もそのまま。分岐したチャット用） */
  copyEvents(fromChatId: number, toChatId: number, upToEventId: number): void {
    this.chats.copyEvents(fromChatId, toChatId, upToEventId);
  }

  /** 会話の記録を、fromEventId から後ろ（fromEventId を含む）すべて消す（巻き戻し用） */
  deleteEventsFrom(chatId: number, fromEventId: number): void {
    this.chats.deleteEventsFrom(chatId, fromEventId);
  }

  listEvents(chatId: number): ChatEvent[] {
    return this.chats.listEvents(chatId);
  }

  /** チャットのやり取り（自分の発言と AI の返答）をキーワードで検索する。新しい順 */
  searchEvents(query: string, filter: { projectId?: number; chatId?: number; limit?: number } = {}): SearchHit[] {
    return this.chats.searchEvents(query, filter);
  }

  /** 起動時の復旧: 前回終了時に動いていた実行を中断扱いにする */
  recoverInterruptedChats(): number {
    const stale = this.listChats({ statuses: ["queued", "running", "waiting"], limit: 1000, includeArchived: true });
    for (const chat of stale) {
      this.updateChat(chat.id, {
        status: "failed",
        error: "アプリの終了により中断しました。メッセージを送ると続きから再開できます。",
        // まだ見ていないので未読にする
        unread: true,
      });
    }
    return stale.length;
  }

  // ---- 送信待ちの指示（db/queues.ts） ----

  /** 保存した送信待ちの列（起動したときに読み戻す） */
  listQueues(): SavedQueue[] {
    return this.queues.list();
  }

  /** 送信待ちの列を丸ごと書く（空なら消す） */
  saveQueue(queue: SavedQueue) {
    this.queues.save(queue);
  }

  // ---- チャットのグループ（db/groups.ts） ----

  listGroups(projectId: number): ChatGroup[] {
    return this.groups.list(projectId);
  }

  getGroup(id: number): ChatGroup | undefined {
    return this.groups.get(id);
  }

  createGroup(projectId: number, name: string): ChatGroup {
    return this.groups.create(projectId, name);
  }

  renameGroup(id: number, name: string): ChatGroup {
    return this.groups.rename(id, name);
  }

  /** ids の順に並べ直す（ほかのプロジェクトのグループは無視する） */
  reorderGroups(projectId: number, ids: number[]): ChatGroup[] {
    return this.groups.reorder(projectId, ids);
  }

  /** グループを消す。中のチャットは消さず、グループなしに戻す */
  deleteGroup(id: number) {
    this.groups.delete(id);
  }
}
