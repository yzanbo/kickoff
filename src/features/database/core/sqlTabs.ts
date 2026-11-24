// SQL のタブ（タブごとの接続）と行の保存: 文を流す・止める・コミット・取り消し・閉じる・切る・SQL の履歴。
// 読み取り専用の接続は、文の判定（1 段目）と DB 側の読み取り専用（2 段目）で守る。「書き込む」の間（write）だけ外す
import { randomUUID } from "node:crypto";
import { editStatements } from "@shared/database/dbEdit";
import { isReadOnlyStatement } from "@shared/database/sqlStatements";
import { sessionName } from "@shared/database/session";
import { DB_DIALECTS } from "@shared/database/dialect";
import { DB_SQL_MAX_ROWS, type DbConnection } from "@shared/database/types";
import type { DbDisconnectResult, DbEditsBody, DbEditsResult, DbSqlBody } from "@shared/database/api";
import { errorMessage } from "@shared/foundation/errors";
import { Invalid } from "@/foundation/core/errors";
import { assertSingleStatement, recordHistory, runWorker, type DbServiceParts } from "./parts";
import type { DbScope } from "./scope";

const sqlSession = (connection: DbConnection, session: string) => sessionName({ kind: "sql", connectionId: connection.id, key: session });

export function createSqlTabs({ store, client, targets }: DbServiceParts) {
  /** SQL のタブごとの、流している文を止める口 */
  const running = new Map<string, AbortController>();

  /** 消した接続のワーカーの接続（木・SQL のタブ・AI）をすべて閉じる（SSH トンネルも残さない） */
  const forgetConnection = async (id: number) => {
    if (!client.running) return;
    await client.request("closeMatching", { prefixes: (["shared", "sql", "ai"] as const).map((kind) => sessionName({ kind, connectionId: id, key: "" })), cleanup_for: id });
  };

  return {
    forgetConnection,

    /**
     * SQL のタブで 1 つの文を流す（タブごとの接続。読み取り専用の接続で書く文は、「書き込む」の間でなければ流す前に断る）。
     * 時間の上限は付けず、止める（cancel）まで待つ
     */
    async sql(scope: DbScope, body: DbSqlBody) {
      const { connection } = scope;
      const { write } = body;
      const offset = body.offset ?? 0;
      // 「さらに読む」は同じ文を流し直すので、書く文では断る（もう一度書き込んでしまう）
      if (offset > 0 && !isReadOnlyStatement(body.sql, connection.engine)) throw new Invalid("続きを読めるのは読み取りの文だけです");
      assertSingleStatement(body.sql, connection.engine, { orNone: true });
      if (connection.read_only && !write && !isReadOnlyStatement(body.sql, connection.engine)) {
        throw new Invalid("読み取り専用の接続なので、書き込む文は流せません（書くときは SQL のタブの「書き込む」を押してください）");
      }
      const target = await targets.target(scope, { write });
      const session = sqlSession(connection, body.session);
      running.get(session)?.abort();
      const controller = new AbortController();
      running.set(session, controller);
      const started = Date.now();
      // 「さらに読む」は履歴に残さない
      const record = (outcome: Parameters<typeof recordHistory>[5]) => offset === 0 && recordHistory(store, connection, body.sql, "user", null, outcome);
      try {
        const result = await runWorker(() =>
          client.request("query", { session, target, sql: body.sql, max_rows: DB_SQL_MAX_ROWS, skip: offset }, { signal: controller.signal, engine: target.engine }),
        );
        record({ duration_ms: result.duration_ms, row_count: result.columns.length > 0 ? result.rows.length : result.affected });
        return result;
      } catch (e) {
        record({ duration_ms: Date.now() - started, error: controller.signal.aborted ? "止めました" : errorMessage(e) });
        throw e;
      } finally {
        if (running.get(session) === controller) running.delete(session);
      }
    },

    /**
     * テーブルの行の変更をまとめて保存する（セルの編集・行の追加と削除・CSV の取り込み）。SQL は画面から受けずに
     * 変更の形から組み立て（@shared/database/dbEdit）、新しい接続の 1 つのトランザクションで流す（更新・削除がちょうど 1 行に当たらなければ、
     * すべて取り消す）。読み取り専用の接続は「書き込む」の間（write）だけ。流した文は SQL の履歴に 1 件で残す
     */
    async applyEdits(scope: DbScope, body: DbEditsBody): Promise<DbEditsResult> {
      const { connection } = scope;
      if (connection.read_only && !body.write) throw new Invalid("読み取り専用の接続なので保存できません（テーブルのタブの「書き込む」を押してから保存してください）");
      const statements = editStatements(connection.engine, body.path, body.table, body.edits);
      if (statements.length === 0) return { affected: [], duration_ms: 0 };
      const target = await targets.target(scope, { write: body.write, database: DB_DIALECTS[connection.engine].databasePerConnection ? body.path.database : null });
      const session = sessionName({ kind: "edit", connectionId: connection.id, key: randomUUID() });
      const sql = statements.map((s) => `${s.preview};`).join("\n");
      const started = Date.now();
      try {
        const result = await runWorker(() => client.request("apply", { session, target, statements: statements.map(({ sql, params, expect }) => ({ sql, params, expect })) }, { engine: target.engine }));
        recordHistory(store, connection, sql, "user", null, { duration_ms: result.duration_ms, row_count: result.affected.reduce((a, b) => a + b, 0) });
        return result;
      } catch (e) {
        recordHistory(store, connection, sql, "user", null, { duration_ms: Date.now() - started, error: errorMessage(e) });
        throw e;
      } finally {
        if (client.running) await client.request("close", { session }).catch(() => {});
      }
    },

    /** SQL の履歴（新しい順） */
    history: (connection: DbConnection, limit: number) => store.dbQueryHistory.list(connection.id, limit),

    /** SQL のタブで流している文を止める（流していなければ何もしない） */
    cancel(connection: DbConnection, session: string) {
      running.get(sqlSession(connection, session))?.abort();
    },

    commit: (connection: DbConnection, session: string) => runWorker(() => client.request("commit", { session: sqlSession(connection, session) })),

    rollback: (connection: DbConnection, session: string) => runWorker(() => client.request("rollback", { session: sqlSession(connection, session) })),

    /** SQL のタブを閉じる（途中のトランザクションは取り消す） */
    async closeSession(connection: DbConnection, session: string) {
      if (!client.running) return;
      await runWorker(() => client.request("close", { session: sqlSession(connection, session) }));
    },

    /** トランザクションの途中か（SQL のタブを閉じる・切るときの確かめ） */
    inTransaction: (connection: DbConnection, session: string) => client.isInTransaction(sqlSession(connection, session)),

    /**
     * 接続を切る（木・テーブルのタブ・SQL のタブ・AI のワーカーの接続をすべて閉じ、トンネルを止めて後片付けを流す。次に使えばつなぎ直す）。
     * コミットしていない SQL のタブがあれば、force でなければ切らずにそのタブ（セッション）を返す（force なら取り消して切る）
     */
    async disconnect(connection: DbConnection, force: boolean): Promise<DbDisconnectResult> {
      const prefix = sqlSession(connection, "");
      const pending = client.transactionsOf(prefix).map((s) => s.slice(prefix.length));
      if (pending.length > 0 && !force) return { disconnected: false, pending_sessions: pending };
      for (const session of pending) running.get(sqlSession(connection, session))?.abort();
      await forgetConnection(connection.id);
      return { disconnected: true, pending_sessions: pending };
    },

    /** 流している文をすべて止める（止めるとき） */
    abortAll() {
      for (const c of running.values()) c.abort();
    },
  };
}
