// つなぐ前の準備のコマンド: 中身を確かめた・流す（待たずに返し、様子は prepState）・止める・記録
import { DB_PREP_UNCONFIRMED, type DbConnection } from "@shared/database/types";
import { Conflict, Invalid } from "@/foundation/core/errors";
import { runWorker, type DbServiceParts } from "./parts";
import { prepVarsOf } from "./target";

export function createPrep({ store, client }: DbServiceParts) {
  return {
    /** いまの準備のコマンドを利用者が確かめた（中身を変えると確かめ済みでなくなる） */
    confirm: (connection: DbConnection) => store.dbConnections.confirmPrep(connection.id),

    /** 準備のコマンドを流し始める（確かめていなければ 409。様子は prepState） */
    prepare(connection: DbConnection) {
      const prep = connection.prep;
      if (!prep || prep.prepare.length === 0) throw new Invalid("この接続には準備のコマンドがありません");
      if (!connection.prep_confirmed) throw new Conflict("準備のコマンドを流す前に、中身を確かめてください", DB_PREP_UNCONFIRMED);
      return runWorker(() => client.request("prepare", { connection_id: connection.id, commands: prep.prepare, cleanup: prep.cleanup, vars: prepVarsOf(connection), my_ip_url: prep.my_ip_url }));
    },

    /** 準備の様子（ワーカーが止まっていれば null） */
    async state(connection: DbConnection) {
      if (!client.running) return null;
      return client.request("prepState", { connection_id: connection.id });
    },

    async cancel(connection: DbConnection) {
      if (!client.running) return;
      await client.request("prepCancel", { connection_id: connection.id });
    },

    /** 記録（いつ・どのコマンド・成功 / 失敗） */
    runs: (connection: DbConnection) => store.dbPrepRuns.list(connection.id),
  };
}
