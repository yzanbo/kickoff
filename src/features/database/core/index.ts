// DB クライアントの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { SecretCipher } from "@/foundation/core/system/sealedSecret";
import type { AiApi } from "@/features/ai/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import type { DockerApi } from "@/features/docker/core/index";
import type { GuardApi } from "@/features/guard/core/index";
import type { NotesApi } from "@/features/notes/core/index";
import type { ProjectsApi } from "@/features/projects/core/index";
import { hiddenDbRuleSource } from "./guard/hiddenDb";
import type { WorktreesApi } from "@/features/worktrees/core/index";
import { DbWorkerClient, type WorkerChannel } from "./workerClient";
import { DbSecretVault } from "./secrets";
import { createDatabaseService } from "./service";
import { createDatabaseStores } from "./db/stores";
import { databaseRoutes } from "./routes/databases";
import { dbToolGroup, openSqlToolGroup } from "./tools";

/** ワーカーのつなぎ（組み立てが渡す。単体のコア・テストはソースの worker/main.ts を fork する） */
export { devWorkerEntry, forkWorker, type WorkerChannel } from "./workerClient";
export { createDatabaseStores } from "./db/stores";

export interface DatabaseDeps {
  /** パスの :projectId の引き当て */
  projects: Pick<ProjectsApi, "param">;
  /** SQL の案を AI に聞く */
  ai: AiApi;
  /** チャットを本当に消したら、AI の SQL の結果の CSV も消す・履歴にチャットの名前を添える */
  chat: Pick<ChatApi, "onChatsPurged" | "titlesOf" | "store">;
  /** ノートを動かしたら、接続の手順ノートを付け替える */
  notes: Pick<NotesApi, "onMoved">;
  /** Docker タブの「DB で開く」の案 */
  docker: Pick<DockerApi, "dbCandidate">;
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
export function createDatabase(k: Kernel, deps: DatabaseDeps, env: DatabaseEnv): CoreFeature<null> {
  const { bus } = k;
  const stores = createDatabaseStores(k.db, (e) => bus.publish(e), k.secrets, deps.chat.titlesOf);
  const store = { ...stores, projects: deps.chat.store.projects, chats: deps.chat.store.chats, groups: deps.chat.store.groups };
  const vault = new DbSecretVault(k, env.secretCipher);
  const databases = createDatabaseService({ store, client: new DbWorkerClient(env.worker), vault, dataDir: k.paths.dataDir, appDataRoot: k.paths.appDataRoot, exportRoot: env.exportRoot, publish: (e) => bus.publish(e), providers: deps.ai.providers, docker: deps.docker });
  // AI の SQL の結果を書き出した CSV のうち、7 日を過ぎたもの・消したチャットのものを消す
  if (env.cleanExports) databases.cleanExports();
  deps.chat.onChatsPurged((ids) => databases.forgetChatExports(ids));
  deps.guard.addRuleSource(hiddenDbRuleSource(databases.hiddenTargets));
  deps.notes.onMoved((e) => stores.dbConnections.remapNotePath(e.project_id, e.from, e.to));
  // ワークツリーを消したら、その DB から作った接続を、選ばれていれば消し、残すなら結び付きだけ外す
  deps.worktrees.useDbConnections((folder) => stores.dbConnections.ofWorktree(folder).map((conn) => ({ id: conn.id, name: conn.name })));
  deps.worktrees.onRemoved(({ path: folder, drop_db_connections }) => {
    if (drop_db_connections) for (const conn of stores.dbConnections.ofWorktree(folder)) databases.removeConnection(conn.id);
    else stores.dbConnections.clearWorktree(folder);
  });
  return {
    name: "database",
    // ほかの機能に出す口はない（サービスはルートと AI のツールだけが使う。テストは core/testing.ts）
    api: null,
    routes: [databaseRoutes({ projectParam: deps.projects.param, databases, docker: deps.docker })],
    aiTools: [dbToolGroup(databases, store), openSqlToolGroup({ store: deps.chat.store, databases, publish: (e) => k.bus.publish(e) })],
    stop: () => databases.close(),
  };
}
