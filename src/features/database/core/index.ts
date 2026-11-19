// DB クライアントの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { SecretCipher } from "@/foundation/core/system/sealedSecret";
import type { AiApi } from "@/features/ai/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import type { DockerService } from "@/features/docker/core/index";
import type { WorktreesApi } from "@/features/worktrees/core/index";
import { DbWorkerClient, type WorkerChannel } from "./client";
import { DbSecretVault } from "./secrets";
import { DatabaseService } from "./service";
import { databaseRoutes } from "./routes/databases";

export type { DatabaseService } from "./service";

export interface DatabaseDeps {
  /** SQL の案を AI に聞く */
  ai: AiApi;
  /** チャットを本当に消したら、AI の SQL の結果の CSV も消す */
  chat: Pick<ChatApi, "onChatsPurged">;
  /** Docker タブの「DB で開く」の案 */
  docker: DockerService;
  /** ワークツリーを消したら、その DB から作った接続を片付ける */
  worktrees: WorktreesApi;
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
export function createDatabase(k: KernelWithStore, deps: DatabaseDeps, env: DatabaseEnv): CoreFeature<DatabaseService> {
  const { store, bus } = k;
  const vault = new DbSecretVault(store, env.secretCipher);
  const databases = new DatabaseService({ store, client: new DbWorkerClient(env.worker), vault, dataDir: k.paths.dataDir, appDataRoot: k.paths.appDataRoot, exportRoot: env.exportRoot, publish: (e) => bus.publish(e) });
  // AI の SQL の結果を書き出した CSV のうち、7 日を過ぎたもの・消したチャットのものを消す
  if (env.cleanExports) databases.cleanExports();
  deps.chat.onChatsPurged((ids) => databases.forgetChatExports(ids));
  // ワークツリーを消したら、その DB から作った接続を、選ばれていれば消し、残すなら結び付きだけ外す
  deps.worktrees.finisher.afterRemove((folder, dropConnections) => {
    if (dropConnections) for (const conn of store.dbConnections.ofWorktree(folder)) databases.removeConnection(conn.id);
    else store.dbConnections.clearWorktree(folder);
  });
  return {
    name: "database",
    api: databases,
    routes: [{ legacy: (app) => databaseRoutes(app, { store, databases, providers: deps.ai.providers, docker: deps.docker }) }],
    stop: () => databases.close(),
  };
}
