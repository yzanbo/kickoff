import type { DatabaseSync } from "node:sqlite";
import { createChatStore } from "./chats.js";
import type { Notify } from "./common.js";
import { createEventStore } from "./events.js";
import { createGroupStore } from "./groups.js";
import { openDatabase } from "./open.js";
import { createProjectStore } from "./projects.js";
import { createQueueStore } from "./queues.js";
import { createSecretStore, createSettingsStore, readDatabaseId } from "./settings.js";
import { createSnippetStore } from "./snippets.js";
import { databaseStats, type DatabaseStats } from "./stats.js";

/**
 * SQLite の永続化層。表ごとの店（store.chats.get など）をまとめて持つ。変更系の操作は onChange で知らせる
 * （画面・スマホへのリアルタイムの配信はこの知らせを起点にする）
 */
export class Store {
  readonly db: DatabaseSync;
  /** この DB を作ったときに決めた ID（meta の表） */
  readonly databaseId: string;
  readonly settings;
  readonly secrets;
  readonly projects;
  readonly groups;
  readonly chats;
  readonly events;
  readonly queues;
  readonly snippets;

  constructor(
    private readonly file: string,
    onChange: Notify = () => {},
  ) {
    this.db = openDatabase(file);
    this.databaseId = readDatabaseId(this.db);
    this.settings = createSettingsStore(this.db, onChange);
    this.secrets = createSecretStore(this.db);
    this.projects = createProjectStore(this.db, onChange);
    this.chats = createChatStore(this.db, onChange);
    this.groups = createGroupStore(this.db, onChange, this.chats.get);
    this.events = createEventStore(this.db, onChange, this.chats.get);
    this.queues = createQueueStore(this.db);
    this.snippets = createSnippetStore(this.db, onChange);
  }

  /** 性能の記録（診断）に載せる DB の様子（ファイルの大きさ・チャットと記録の数・記録の多いチャット） */
  stats(): DatabaseStats {
    return databaseStats(this.db, this.file);
  }

  close() {
    this.db.close();
  }
}
