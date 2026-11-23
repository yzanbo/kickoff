// サービスの部品が共有するもの（店・ワーカーの呼び手・金庫・つなぐ先の組み立て）と、ワーカーの失敗の受け方・SQL の履歴の残し方
import { splitStatements } from "@shared/database/sqlStatements";
import type { DbConnection, DbEngine, DbQueryRanBy } from "@shared/database/types";
import { DbWorkerError } from "@shared/database/workerProtocol";
import { errorMessage } from "@shared/foundation/errors";
import { Conflict, Invalid, NotFound } from "@/foundation/core/errors";
import type { DatabaseStores } from "./db/stores";
import type { DbSecretVault } from "./secrets";
import type { DbTargets } from "./target";
import type { DbWorkerClient } from "./workerClient";

export interface DbServiceParts {
  /** 自分の表の店と、CSV の片付けで消したチャットかを見る chat の店 */
  store: DatabaseStores & { chats: { get(id: number): unknown } };
  client: DbWorkerClient;
  /** パスワードの暗号化・復号（キーチェーンで開けなければ、その場で入れた値をメモリに持つ） */
  vault: DbSecretVault;
  targets: DbTargets;
}

/** ワーカーの失敗を「その操作はできない」（400）にする（初めての SSH のサーバーは 409 と印 DB_SSH_UNKNOWN_HOST。画面が鍵を確かめさせる） */
export async function runWorker<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Invalid || e instanceof NotFound || e instanceof Conflict) throw e;
    if (e instanceof DbWorkerError && e.code) throw new Conflict(e.message, e.code);
    throw new Invalid(errorMessage(e));
  }
}

/** 1 回に流すのは 1 つの文だけ（DB によっては 2 つ目からの文を黙って捨てる。画面が文に分けて 1 つずつ送る。orNone なら文のない SQL も DB に任せる） */
export function assertSingleStatement(sql: string, engine: DbEngine, { orNone = false } = {}) {
  const count = splitStatements(sql, engine).length;
  if (count > 1 || (count === 0 && !orNone)) throw new Invalid("1 回に流せるのは 1 つの文だけです");
}

/** 流した文の結果（行の数か失敗の文） */
type Outcome = { duration_ms: number; row_count?: number | null; error?: string };

/** 流した文を SQL の履歴に残す（成功・失敗とも。判定で断った文は流していないので呼ばない） */
export function recordHistory(store: DbServiceParts["store"], connection: DbConnection, sql: string, ranBy: DbQueryRanBy, chatId: number | null, outcome: Outcome) {
  store.dbQueryHistory.add({ connection_id: connection.id, sql, ran_by: ranBy, chat_id: chatId, ...outcome });
}
