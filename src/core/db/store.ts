import type { DatabaseSync } from "node:sqlite";
import { createChatStore } from "./chats.js";
import type { Notify } from "./common.js";
import { createDbConnectionStore } from "./dbConnections.js";
import { createDbErLayoutStore } from "./dbErLayouts.js";
import { createDbQueryHistoryStore } from "./dbQueryHistory.js";
import { createDbPrepRunStore } from "./dbPrepRuns.js";
import { createDeviceStore } from "./devices.js";
import { createEventStore } from "./events.js";
import { createGroupStore } from "./groups.js";
import { openDatabase } from "./open.js";
import { createPrNoticeStore } from "./prNotices.js";
import { createCiNoticeStore } from "./ciNotices.js";
import { createProjectStore } from "./projects.js";
import { createQueueStore } from "./queues.js";
import { createSecretStore, createSettingsStore, readDatabaseId } from "./settings.js";
import { createSnippetStore } from "./snippets.js";
import { databaseStats, type DatabaseStats } from "./stats.js";
import { createWorktreeEnvStore } from "./worktreeEnvs.js";

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
  readonly events;
  readonly queues;
  readonly snippets;
  /** ワークツリーの PR の知らせで、確認を閉じた PR */
  readonly prNotices;
  /** CI の失敗を知らせた実行（同じ実行を知らせ直さない） */
  readonly ciNotices;
  /** DB クライアントの接続（プロジェクトごと。パスワードは secrets） */
  readonly dbConnections;
  readonly dbQueryHistory;
  readonly dbErLayouts;
  readonly dbPrepRuns;
  /** ワークツリーの実行環境（ポートの帯・組の名前） */
  readonly worktreeEnvs;
  /** スマホ連携の端末（トークンの hash・最後に使った時刻・プッシュの宛先） */
  readonly devices;

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
    this.prNotices = createPrNoticeStore(this.db);
    this.ciNotices = createCiNoticeStore(this.db);
    this.dbConnections = createDbConnectionStore(this.db, onChange, this.secrets);
    this.dbQueryHistory = createDbQueryHistoryStore(this.db);
    this.dbErLayouts = createDbErLayoutStore(this.db);
    this.dbPrepRuns = createDbPrepRunStore(this.db);
    this.worktreeEnvs = createWorktreeEnvStore(this.db);
    this.devices = createDeviceStore(this.db);
  }

  /** 性能の記録（診断）に載せる DB の様子（ファイルの大きさ・チャットと記録の数・記録の多いチャット） */
  stats(): DatabaseStats {
    return databaseStats(this.db, this.file);
  }

  close() {
    this.db.close();
  }
}
