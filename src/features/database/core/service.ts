// DB クライアントの窓口（ルートとチャットの AI から使う）: 接続の登録（connections）・つなぐ先（target）・木とテーブル（browse）・
// SQL のタブ（sqlTabs）・AI の SQL（aiQuery）・準備（prep）を組み、つないでいる接続を数える。DB に触るのは別のプロセスの DB ワーカー
import { countsAsConnected, parseSession } from "@shared/database/session";
import type { BusEvent } from "@shared/foundation/contract";
import type { AiApi } from "@/features/ai/core/index";
import type { DockerApi } from "@/features/docker/core/index";
import { createAiConnections } from "./aiConnections";
import { createAiQuery } from "./aiQuery";
import { aiExportRoot } from "./aiExports";
import { createBrowse } from "./browse";
import { createConnections } from "./connections";
import type { DbServiceParts } from "./parts";
import { createPrep } from "./prep";
import type { DbSecretVault } from "./secrets";
import { createSqlAssist } from "./sqlAssist";
import { createSqlTabs } from "./sqlTabs";
import { createTargets } from "./target";
import type { DbWorkerClient } from "./workerClient";

interface Options {
  store: DbServiceParts["store"];
  client: DbWorkerClient;
  vault: DbSecretVault;
  /** Kickoff 自身の保存先（この中のファイルは登録させない。製品版・開発版の保存先もいつも断る） */
  dataDir: string;
  /** 製品版・開発版の保存先の親のフォルダ（OS の口の appDataRoot） */
  appDataRoot: string;
  /** AI の SQL の結果を書き出す CSV の置き場所（省けば OS の一時フォルダの <保存先の名前>-db。テストは一時フォルダの中） */
  exportRoot?: string;
  /** 接続の状態の知らせ（SSE の db_connection_state。省けば知らせない） */
  publish?: (event: BusEvent) => void;
  /** SQL のタブの「AI に頼む」の AI（省けば頼めない） */
  providers?: AiApi["providers"];
  /** Docker タブの「DB で開く」の案を compose に聞き直す（省けば docker: の案を取り込めない） */
  docker?: Pick<DockerApi, "dbCandidate">;
}

export type DatabaseService = ReturnType<typeof createDatabaseService>;

export function createDatabaseService(opts: Options) {
  const { store, client, vault } = opts;
  const parts: DbServiceParts = { store, client, vault, targets: createTargets(opts) };
  const browse = createBrowse(parts);
  const sqlTabs = createSqlTabs(parts);
  /** 接続ごとの、ワーカーの中で開いている接続（セッション）の数（つないでいる印。0 になったら消す） */
  const openCounts = new Map<number, number>();

  /** 開いた・閉じた接続（セッション）を数え、つないでいるかが変わったら知らせる（数えるのは木・テーブルのタブと SQL のタブ） */
  const countSession = (name: string, open: boolean) => {
    const session = parseSession(name);
    if (!session || !countsAsConnected(session)) return;
    const id = session.connectionId;
    const before = openCounts.get(id) ?? 0;
    const after = Math.max(0, before + (open ? 1 : -1));
    if (after === 0) openCounts.delete(id);
    else openCounts.set(id, after);
    if ((before > 0) === (after > 0)) return;
    const connection = store.dbConnections.get(id);
    if (connection) opts.publish?.({ type: "db_connection_state", project_id: connection.project_id, connection_id: id, connected: after > 0 });
  };
  // ワーカーが流したコマンドの結果を準備の記録に残す（消した接続のものは残さない）
  client.onEvent = (event) => {
    if (event.event === "prep_run" && store.dbConnections.get(event.connection_id)) store.dbPrepRuns.add(event.connection_id, event.kind, event.command, event.ok);
    if (event.event === "session") countSession(event.name, event.open);
  };

  return {
    /** 表の店（チャットの実行が AI に見せる接続を読む） */
    stores: store,
    /** パスワードの暗号化・復号 */
    vault,
    ...createConnections(parts, opts.docker),
    ...createAiConnections((projectId) => store.dbConnections.list(projectId)),
    ...browse,
    ...sqlTabs,
    ...createAiQuery(parts, opts.exportRoot ?? aiExportRoot(opts.dataDir)),
    prep: createPrep(parts),
    sqlAssist: createSqlAssist(opts.providers ?? {}, browse.outline),

    /** つないでいる接続の ID（プロジェクトの分） */
    connectedIds: (projectId: number) => [...openCounts.keys()].filter((id) => store.dbConnections.get(id)?.project_id === projectId),

    /** 接続を消す（パスワードは表のトリガーが消す。開いていた接続と SSH トンネルは待たずに閉じる）。接続の削除とワークツリーを消すときで同じ */
    removeConnection(id: number) {
      store.dbConnections.delete(id);
      vault.forget(id);
      void sqlTabs.forgetConnection(id).catch(() => {});
    },

    /** 止める（準備した接続の後片付けのコマンドを流してから） */
    async close() {
      sqlTabs.abortAll();
      await client.shutdown();
    },
  };
}
