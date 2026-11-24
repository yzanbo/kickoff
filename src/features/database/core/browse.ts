// 木・テーブルのタブ（接続・作業場所・DB ごとに共有の 1 本の接続）: DB・スキーマ・物の一覧・テーブルの構造と行・数・ER 図・補完の名前
import { splitStatements } from "@shared/database/sqlStatements";
import { sessionName } from "@shared/database/session";
import { DB_DIALECTS } from "@shared/database/dialect";
import { DB_TABLE_PAGE_ROWS, type DbEngine, type DbObjectPath, type DbRowFilter } from "@shared/database/types";
import type { DbFullRow, DbFullRowBody, DbRowsBody } from "@shared/database/api";
import { Invalid, NotFound } from "@/foundation/core/errors";
import { runWorker, type DbServiceParts } from "./parts";
import type { DbScope } from "./scope";

/** 絞り込みの WHERE の文に、文の区切り（2 つ目の文）を入れさせない（式だけを受ける） */
function assertWhere(filter: DbRowFilter, engine: DbEngine) {
  if (filter.where === null || filter.where.trim() === "") return;
  if (splitStatements(`SELECT 1 WHERE ${filter.where}`, engine).length > 1) throw new Invalid("WHERE には式だけを書いてください（; で文を足せません）");
}

/** テーブルのタブ・木で共有する接続の名前（接続・作業場所・DB ごとに 1 本） */
const sharedSession = ({ connection, workdir }: DbScope, database: string | null) => sessionName({ kind: "shared", connectionId: connection.id, key: `${workdir ?? "-"}:${database ?? "-"}` });

type BrowseMethod = "objects" | "table" | "definition" | "er" | "count" | "outline" | "rows";

export function createBrowse({ store, client, targets }: DbServiceParts) {
  /** 木・テーブルのタブの頼み（場所の DB で共有の接続を選ぶ。PostgreSQL は DB ごとにつなぐ。ほかは 1 本の接続で DB を名前で指す） */
  const browse = async <M extends BrowseMethod>(method: M, scope: DbScope, objectPath: DbObjectPath, extra: Record<string, unknown>) => {
    const database = DB_DIALECTS[scope.connection.engine].databasePerConnection ? objectPath.database : null;
    const target = await targets.target(scope, { database });
    const session = sharedSession(scope, target.database);
    return runWorker(() => client.request(method, { session, target, path: objectPath, ...extra } as never, { engine: target.engine }));
  };

  return {
    async databases(scope: DbScope) {
      const target = await targets.target(scope);
      const result = await runWorker(() => client.request("databases", { session: sharedSession(scope, target.database), target }, { engine: target.engine }));
      store.dbConnections.touchConnected(scope.connection.id);
      return result;
    },

    async schemas(scope: DbScope, database: string | null) {
      const target = await targets.target(scope, { database });
      return runWorker(() => client.request("schemas", { session: sharedSession(scope, target.database), target, database }, { engine: target.engine }));
    },

    objects: (scope: DbScope, objectPath: DbObjectPath) => browse("objects", scope, objectPath, {}),

    table: (scope: DbScope, objectPath: DbObjectPath, name: string) => browse("table", scope, objectPath, { name }),

    /** 関数・列挙型の定義（木から開いたタブ） */
    definition: (scope: DbScope, objectPath: DbObjectPath, kind: "function" | "enum", name: string) => browse("definition", scope, objectPath, { kind, name }),

    /** ER 図の中身（names: 描くテーブル。null なら多すぎなければすべて） */
    er: (scope: DbScope, objectPath: DbObjectPath, names: string[] | null) => browse("er", scope, objectPath, { names }),

    /** テーブルの行（絞り込みの WHERE の文は 1 文の中の式だけ。2 つ目の文を足させない） */
    rows(scope: DbScope, body: DbRowsBody) {
      const filter = body.filter ?? { filters: [], where: null };
      assertWhere(filter, scope.connection.engine);
      return browse("rows", scope, body.path, { name: body.table, sort: body.sort, offset: body.offset, limit: DB_TABLE_PAGE_ROWS, filter });
    },

    /** テーブルの 1 行を全体のまま（長い文字の残りを取る。条件がちょうど 1 行に当たらなければ失敗） */
    async fullRow(scope: DbScope, body: DbFullRowBody): Promise<DbFullRow> {
      if (body.filters.length === 0) throw new Invalid("行を指す条件がありません");
      const result = await browse("rows", scope, body.path, { name: body.table, sort: [], offset: 0, limit: 2, filter: { filters: body.filters, where: null }, full: true });
      if (result.rows.length === 0) throw new NotFound("行が見つかりません（ほかで変わったか、消えたのかもしれません）");
      if (result.rows.length > 1) throw new Invalid("行を 1 つに決められません");
      return { columns: result.columns, row: result.rows[0]! };
    },

    count(scope: DbScope, objectPath: DbObjectPath, name: string, filter: DbRowFilter) {
      assertWhere(filter, scope.connection.engine);
      return browse("count", scope, objectPath, { name, filter });
    },

    outline: (scope: DbScope, objectPath: DbObjectPath) => browse("outline", scope, objectPath, {}),

    /** ER 図で動かしたテーブルの位置（接続と場所ごと） */
    erLayouts: store.dbErLayouts,
  };
}
