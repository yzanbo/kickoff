import type { DatabaseSync } from "node:sqlite";
import { createChatStore } from "@/features/chat/core/db/chats";
import { createChatProviderSessionStore } from "@/features/chat/core/db/chatProviderSessions";
import { createChatProviderHandoffStore, createProviderSwitchStore } from "@/features/chat/core/db/chatProviderHandoffs";
import type { Notify } from "./common";
import type { DbSecretKey } from "@/features/database/core/db/dbConnections";
import { createDeviceStore } from "@/features/devices/core/db/devices";
import { createEventStore } from "@/features/chat/core/db/events";
import { createGroupStore } from "@/features/groups/core/db/groups";
import { createLogRevisions, type LogRevisions } from "@/features/chat/core/db/logRevisions";
import { createProjectStore } from "@/features/projects/core/db/projects";
import { createQueueStore } from "@/features/chat/core/db/queues";
import { createSecretStore, type SecretStore } from "@/foundation/core/settings/secretStore";
import { createSettingsStore, type SettingsStore } from "@/foundation/core/settings/settingsStore";
import { readDatabaseId } from "./db";
import { createSnippetStore } from "@/features/snippets/core/db/snippets";
import { createTrashStore } from "@/features/trash/core/db/trash";
import { createAgentSessionStore } from "@/features/chat/core/db/agentSessions";
import { DEFAULT_SETTINGS, type AppSettings, type ProviderId, type SettingsPatch } from "@shared/settings/types";

/** 秘密の値の名前（secrets の表）: 音声入力の OpenAI のキー・DB の接続のパスワード（接続を消したら表のトリガーで消える）・AI の API キー */
export type SecretKey = "openai_transcribe_key" | DbSecretKey | `provider_api_key:${ProviderId}`;

/** 土台の店（設定・秘密の値・DB の ID）。Kernel が作り、店の束はそれを指す（設定の宣言を機能ごとにするまで、既定と鍵の形はここで決める） */
export interface BaseStores {
  readonly databaseId: string;
  readonly settings: SettingsStore<AppSettings, SettingsPatch>;
  readonly secrets: SecretStore<SecretKey>;
}

/** 土台の店を開く（設定は DEFAULT_SETTINGS と混ぜ、AI ごとの既定は AI ごとに重ねる） */
export function openBaseStores(db: DatabaseSync, onChange: Notify): BaseStores {
  return {
    databaseId: readDatabaseId(db),
    settings: createSettingsStore<AppSettings, SettingsPatch>(db, DEFAULT_SETTINGS, (settings) => onChange({ type: "settings", settings }), ["provider_chat_defaults"]),
    secrets: createSecretStore<SecretKey>(db),
  };
}

/**
 * SQLite の永続化層。表ごとの店（store.chats.get など）をまとめて持つ。変更系の操作は onChange で知らせる
 * （画面・スマホへのリアルタイムの配信はこの知らせを起点にする）
 */
export class Store {
  readonly db: DatabaseSync;
  /** この DB を作ったときに決めた ID（meta の表）。スマホ連携の本体の ID（スマホが複数の本体を切り替える目印）も兼ねる */
  readonly databaseId: string;
  readonly settings: BaseStores["settings"];
  readonly secrets: BaseStores["secrets"];
  readonly projects;
  readonly groups;
  readonly chats;
  readonly chatProviderSessions;
  readonly chatProviderHandoffs;
  readonly events;
  readonly queues;
  readonly snippets;
  /** スマホ連携の端末（トークンの hash・最後に使った時刻・プッシュの宛先） */
  readonly devices;
  /** Kickoff のゴミ箱（消したものを 3 日だけ取っておく。中身のファイルは trash/TrashService が置き場に置く） */
  readonly trash;
  /** Kickoff が作ったセッション（Claude Code の会話記録）の覚え（使われなくなったらゴミ箱へ。trash/sessionTrash.ts） */
  readonly agentSessions;
  /** 記録を足す以外の形で変えた知らせ（巻き戻し・セッションの付け替え・チャットの削除。コアの索引の覚えを捨てる合図） */
  readonly logRevisions: LogRevisions = createLogRevisions();
  /** AI の切り替えの保存（chats・chat_events・providerSwitch の表を 1 つのトランザクションで） */
  readonly providerSwitch;

  /** db は版をそろえて開いたもの（openDb。組み立てが全部の機能の版を渡す）。土台の店は Kernel が開いたものを受ける（省けばここで開く） */
  constructor(
    db: DatabaseSync,
    onChange: Notify = () => {},
    base: BaseStores = openBaseStores(db, onChange),
  ) {
    this.db = db;
    this.databaseId = base.databaseId;
    this.settings = base.settings;
    this.secrets = base.secrets;
    this.projects = createProjectStore(this.db, onChange);
    this.chats = createChatStore(this.db, onChange, this.logRevisions, this.settings.get);
    this.chatProviderSessions = createChatProviderSessionStore(this.db);
    this.chatProviderHandoffs = createChatProviderHandoffStore(this.db);
    this.groups = createGroupStore(this.db, onChange, {
      idsIn: (group) => this.chats.list({ projectId: group.project_id, includeArchived: true }).flatMap((c) => (c.group_id === group.id ? [c.id] : [])),
      getChat: this.chats.get,
    });
    this.events = createEventStore(this.db, onChange, this.chats.get, this.logRevisions);
    this.queues = createQueueStore(this.db);
    this.snippets = createSnippetStore(this.db, onChange, this.projects.trashedIds);
    this.devices = createDeviceStore(this.db);
    this.trash = createTrashStore(this.db, onChange);
    this.agentSessions = createAgentSessionStore(this.db);
    this.providerSwitch = createProviderSwitchStore(this.db, onChange, this);
  }

  close() {
    this.db.close();
  }
}
