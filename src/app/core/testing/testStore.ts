// テストの店: 全部の機能の表を v1 で作った DB（既定はメモリ）に、chat の店の束と機能の店を開いたもの。テストと決まったデータの道具からだけ使う
import { createProjectAiDefaultsStore } from "@/features/ai/core/db/projectAiDefaults";
import type { DatabaseSync } from "node:sqlite";
import type { Notify } from "@/foundation/core/db/common";
import { openDb, readDatabaseId } from "@/foundation/core/db/db";
import type { Kernel } from "@/foundation/core/kernel";
import { createSecretStore } from "@/foundation/core/settings/secretStore";
import { openAppSettings } from "@/foundation/core/settings/settingsStore";
import { ALL_SETTINGS } from "@/app/shared/settings";
import { chatTitlesOf } from "@/features/chat/core/db/chatTitles";
import type { ChatStoreDeps } from "@/features/chat/core/index";
import { createChatStores } from "@/features/chat/core/stores";
import { createDatabaseStores } from "@/features/database/core/index";
import { createDeviceStore } from "@/features/devices/core/db/devices";
import { createGitHubStores } from "@/features/github/core/index";
import { createGroupStore } from "@/features/groups/core/db/groups";
import { createProjectStore } from "@/features/projects/core/db/projects";
import { createChatImageStore } from "@/features/remoteImages/core/db/chatImages";
import { createSnippetStore, type SnippetStore } from "@/features/snippets/core/db/snippets";
import { createTrashStore } from "@/features/trash/core/db/trash";
import { createWorktreeStores } from "@/features/worktrees/core/index";
import { createProviderHandoffStores, createProviderSwitchStore } from "@/features/providerSwitch/core/index";
import { MIGRATIONS } from "@/app/core/migrations";
import { MEMORY_DB } from "@/foundation/core/testing/memoryDb";

/** 土台の店（設定・秘密の値・DB の ID） */
type BaseStores = Pick<Kernel, "settings" | "secrets"> & { databaseId: string };

/** 土台の店を開く（Kernel がないとき。設定は全部の機能の表） */
function openBaseStores(db: DatabaseSync, onChange: Notify): BaseStores {
  return { databaseId: readDatabaseId(db), settings: openAppSettings(db, ALL_SETTINGS, (settings) => onChange({ type: "settings", settings })), secrets: createSecretStore(db) };
}

/** chat の束にない店（土台の DB の ID・秘密の値と、AI の切り替え・端末・DB クライアント・GitHub・ワークツリー・外の画像の店）。店は DB のほかに状態を持たない */
function extraStores(chat: ChatStoreDeps, base: Pick<BaseStores, "databaseId" | "secrets">, onChange: Notify) {
  const { db } = chat;
  const handoffs = createProviderHandoffStores(db);
  return {
    ...handoffs,
    providerSwitch: createProviderSwitchStore(db, onChange, { ...chat, ...handoffs }),
    databaseId: base.databaseId,
    secrets: base.secrets,
    devices: createDeviceStore(db),
    ...createDatabaseStores(db, onChange, base.secrets, chatTitlesOf(db)),
    ...createGitHubStores(db),
    ...createWorktreeStores(db),
    chatImages: createChatImageStore(db),
    close: () => db.close(),
  };
}

/** テストが表を直に見る・データを入れる店（chat の店の束と、ほかの機能の店） */
export type TestStores = ChatStoreDeps & { snippets: SnippetStore } & ReturnType<typeof extraStores>;

/** chat の店の束（組み立てた chat のもの）に、ほかの機能の店を足す */
export function withFeatureStores(store: ChatStoreDeps, base: Pick<BaseStores, "databaseId" | "secrets">, onChange: Notify = () => {}): TestStores {
  return Object.assign(store as ChatStoreDeps & { snippets: SnippetStore }, extraStores(store, base, onChange));
}

/** 開いた DB に全部の店を開く（土台の設定・秘密の値は渡したもの、省けばここで開く） */
export function openTestStores(db: DatabaseSync, onChange: Notify = () => {}, base: BaseStores = openBaseStores(db, onChange)): TestStores {
  const projects = createProjectStore(db, onChange);
  const chat = createChatStores(db, onChange, base.settings, createProviderHandoffStores(db).chatProviderSessions.remembered);
  const groups = createGroupStore(db, onChange, {
    idsIn: (group) => chat.chats.list({ projectId: group.project_id, includeArchived: true }).flatMap((c) => (c.group_id === group.id ? [c.id] : [])),
    ungrouped: (chatId) => onChange({ type: "chat", chat: chat.chats.get(chatId)! }),
  });
  const store: ChatStoreDeps = { ...chat, db, settings: base.settings, projects, groups, trash: createTrashStore(db, onChange), snippets: createSnippetStore(db, onChange, projects.trashedIds), aiDefaults: createProjectAiDefaultsStore(db, onChange) };
  return withFeatureStores(store, base, onChange);
}

/** file を省くとメモリの DB。ファイルを渡すと、開き直したときも同じ版で開く */
export function testStore({ file = MEMORY_DB, onChange }: { file?: string; onChange?: Notify } = {}): TestStores {
  return openTestStores(openDb(file, MIGRATIONS), onChange);
}
