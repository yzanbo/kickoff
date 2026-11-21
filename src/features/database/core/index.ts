// DB クライアントの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { SecretCipher } from "@/foundation/core/system/sealedSecret";
import type { AiApi } from "@/features/ai/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import type { DockerService } from "@/features/docker/core/index";
import type { GuardApi } from "@/features/guard/core/index";
import { hiddenDbRuleSource } from "./guard/hiddenDb";
import type { WorktreesApi } from "@/features/worktrees/core/index";
import { DbWorkerClient, type WorkerChannel } from "./client";
import { DbSecretVault } from "./secrets";
import { DatabaseService } from "./service";
import { createDatabaseStores } from "./db/stores";
import { databaseRoutes } from "./routes/databases";
import { dbToolGroup } from "./dbTools";

export type { DatabaseService } from "./service";
export { createDatabaseStores } from "./db/stores";

export interface DatabaseDeps {
  /** SQL の案を AI に聞く */
  ai: AiApi;
  /** チャットを本当に消したら、AI の SQL の結果の CSV も消す・履歴にチャットの名前を添える */
  chat: Pick<ChatApi, "onChatsPurged" | "titlesOf" | "store">;
  /** Docker タブの「DB で開く」の案 */
  docker: DockerService;
  /** ワークツリーを消したら、その DB から作った接続を片付ける */
  worktrees: WorktreesApi;
  /** 見せない DB の守りを登録する */
  guard: Pick<GuardApi, "addRuleSource">;
}

export interface DatabaseEnv {
  /** DB ワーカーを起動してつなぐ */
  worker: () => WorkerChannel;
  /** パスワードの暗号化（null なら暗号化せずに置く） */
  secretCipher: SecretCipher | null;
  /** AI の SQL の結果の CSV の置き場所（省けば保存先の中） */
  exportRoot?: string;
  /** 起動したときに古い CSV を消すか */
  cleanExports: boolean;
}

/** DB クライアント（DB の処理は別のプロセス。初めて使ったときに起動し、何もしない状態が 5 分続いたら止める。チャットの AI にも DB のツールで読ませる。パスワードはキーチェーンの鍵で暗号化） */
export function createDatabase(k: Kernel, deps: DatabaseDeps, env: DatabaseEnv): CoreFeature<DatabaseService> {
  const { bus } = k;
  const stores = createDatabaseStores(k.db, (e) => bus.publish(e), k.secrets, deps.chat.titlesOf);
  const store = { ...stores, projects: deps.chat.store.projects, chats: deps.chat.store.chats, groups: deps.chat.store.groups };
  const vault = new DbSecretVault(k, env.secretCipher);
  const databases = new DatabaseService({ store, client: new DbWorkerClient(env.worker), vault, dataDir: k.paths.dataDir, appDataRoot: k.paths.appDataRoot, exportRoot: env.exportRoot, publish: (e) => bus.publish(e) });
  // AI の SQL の結果を書き出した CSV のうち、7 日を過ぎたもの・消したチャットのものを消す
  if (env.cleanExports) databases.cleanExports();
  deps.chat.onChatsPurged((ids) => databases.forgetChatExports(ids));
  deps.guard.addRuleSource(hiddenDbRuleSource((projectId) => stores.dbConnections.list(projectId)));
  // ワークツリーを消したら、その DB から作った接続を、選ばれていれば消し、残すなら結び付きだけ外す
  deps.worktrees.useDbConnections((folder) => stores.dbConnections.ofWorktree(folder).map((conn) => ({ id: conn.id, name: conn.name })));
  deps.worktrees.finisher.afterRemove((folder, dropConnections) => {
    if (dropConnections) for (const conn of stores.dbConnections.ofWorktree(folder)) databases.removeConnection(conn.id);
    else stores.dbConnections.clearWorktree(folder);
  });
  return {
    name: "database",
    api: databases,
    routes: [{ legacy: (app) => databaseRoutes(app, { store, databases, providers: deps.ai.providers, docker: deps.docker }) }],
    aiTools: [dbToolGroup(databases, store)],
    stop: () => databases.close(),
  };
}
