// チャットの AI が流す SQL（読み取りの 1 文だけ）と、結果の CSV の片付け
import { randomUUID } from "node:crypto";
import { isReadOnlyStatement } from "@shared/database/sqlStatements";
import { sessionName } from "@shared/database/session";
import { DB_DIALECTS } from "@shared/database/dialect";
import type { DbEngine } from "@shared/database/types";
import { errorMessage } from "@shared/foundation/errors";
import { Invalid } from "@/foundation/core/errors";
import { AI_EXPORT_KEEP_MS, aiExportFile, cleanAiExports, removeChatExports } from "./aiExports";
import { DB_AI_MAX_ROWS, DB_AI_TIMEOUT_MS } from "./aiFormat";
import { assertSingleStatement, recordHistory, type DbServiceParts } from "./parts";
import type { DbScope } from "./scope";

/** AI の SQL の DB の側の時間の上限を、手元で止める時間より長くする分（手元の方が先に止めて「時間切れ」の文を返すため） */
const DB_SIDE_TIMEOUT_MARGIN_MS = 5_000;

/** 片付けの間隔（CSV を書き出すたびに、これより前に片付けていれば片付ける） */
const EXPORT_CLEAN_INTERVAL_MS = 60 * 60_000;

/** AI が流せる SQL か（読み取りの 1 文だけ）。承認を聞く前にも確かめる（流せない文を利用者に聞かない） */
export function assertAiSql(sql: string, engine: DbEngine) {
  assertSingleStatement(sql, engine);
  if (!isReadOnlyStatement(sql, engine)) throw new Invalid("AI が流せるのは読み取りの文（SELECT・WITH・SHOW・EXPLAIN など）だけです");
}

/** チャットの作業を止めたので AI の SQL も止めたときの文 */
const TURN_STOPPED = "チャットの作業を止めたので、SQL も止めました";

/** 時間の上限で止めたときの文（30 秒なら、延ばして頼み直す方法を AI に伝える） */
function timeoutMessage(minutes: number | null | undefined) {
  if (minutes) return `${minutes} 分を超えたので止めました。`;
  return `${DB_AI_TIMEOUT_MS / 1000} 秒を超えたので止めました。もっと時間がかかる SQL なら、timeout_minutes に流してよい時間（分）を入れてもう一度呼んでください（利用者に承認を聞きます）。`;
}

export function createAiQuery({ store, client, targets }: DbServiceParts, exportRoot: string) {
  let exportCleanedAt = 0;

  /** AI の SQL の CSV を片付ける（7 日を過ぎたもの・もうないチャットのもの。起動のときと、書き出したときに 1 時間ごと） */
  const cleanExports = (now = Date.now()) => {
    exportCleanedAt = now;
    try {
      cleanAiExports(exportRoot, (chatId) => store.chats.get(chatId) !== undefined, now, AI_EXPORT_KEEP_MS);
    } catch (e) {
      console.warn(`[databases] AI の SQL の CSV を片付けられませんでした: ${errorMessage(e)}`);
    }
  };

  return {
    exportRoot,
    cleanExports,

    /** チャットを消したら、そのチャットの CSV も消す */
    forgetChatExports(chatIds: number[]) {
      for (const id of chatIds) removeChatExports(exportRoot, id);
    },

    /**
     * チャットの AI が流す SQL（読み取りの 1 文だけ）。守りは 4 段: 文の判定・DB 側の読み取り専用・呼び出しごとの新しい接続（SET などの状態を残さない）・
     * AI 用のユーザー（あれば）。DB_AI_TIMEOUT_MS（30 秒）を超えたら止める（timeoutMinutes があればその分。利用者が承認したときだけ渡る）。
     * チャットの作業を止めたら（signal）SQL も止める。DB_AI_MAX_ROWS 行を超える結果は、すべての行を CSV に書き出して場所を返す。結果は履歴に AI の印で残す
     */
    async aiQuery(scope: DbScope, input: { sql: string; database: string | null; chatId: number; timeoutMinutes?: number | null; signal?: AbortSignal }) {
      const { connection } = scope;
      assertAiSql(input.sql, connection.engine);
      // 承認を待つ間にチャットの作業を止めていたら流さない
      if (input.signal?.aborted) throw new Invalid(TURN_STOPPED);
      const limitMs = input.timeoutMinutes ? input.timeoutMinutes * 60_000 : DB_AI_TIMEOUT_MS;
      const controller = new AbortController();
      const stopTurn = () => controller.abort();
      const forget = () => input.signal?.removeEventListener("abort", stopTurn);
      // つなぐ先を組む間（キーチェーンの許可を待つことがある）に止めても流さないよう、待つ前から受ける
      input.signal?.addEventListener("abort", stopTurn, { once: true });
      const dialect = DB_DIALECTS[connection.engine];
      // DB の側にも時間の上限を付ける（ワーカーが落ちても DB の中で流れ続けない）。手元で止める方が先に効くよう少し長く（止めたときの文を「時間切れ」にするため）
      const built = await targets.target(scope, { database: dialect.databasePerConnection ? input.database : null, ai: true }).catch((e: unknown) => { forget(); throw e; });
      const target = { ...built, timeout_ms: limitMs + DB_SIDE_TIMEOUT_MARGIN_MS };
      if (controller.signal.aborted) { forget(); throw new Invalid(TURN_STOPPED); }
      const session = sessionName({ kind: "ai", connectionId: connection.id, key: randomUUID() });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, limitMs);
      const started = Date.now();
      const { sql } = input;
      try {
        // MySQL は DB を名前で指すので、指されたら先に切り替える（同じ接続の中だけ。終わったら閉じる）
        if (dialect.useDatabase && input.database) await client.request("query", { session, target, sql: dialect.useDatabase(input.database), max_rows: 1 }, { signal: controller.signal, engine: target.engine });
        const file = aiExportFile(exportRoot, input.chatId, connection.name);
        const result = await client.request("export", { session, target, sql, file, head_rows: DB_AI_MAX_ROWS }, { signal: controller.signal, engine: target.engine });
        recordHistory(store, connection, sql, "ai", input.chatId, { duration_ms: result.duration_ms, row_count: result.columns.length > 0 ? result.total_rows : result.affected });
        store.dbConnections.touchConnected(connection.id);
        if (result.file && Date.now() - exportCleanedAt > EXPORT_CLEAN_INTERVAL_MS) cleanExports();
        return result;
      } catch (e) {
        const error = timedOut ? timeoutMessage(input.timeoutMinutes) : controller.signal.aborted ? TURN_STOPPED : errorMessage(e);
        recordHistory(store, connection, sql, "ai", input.chatId, { duration_ms: Date.now() - started, error });
        throw new Invalid(error);
      } finally {
        clearTimeout(timer);
        forget();
        if (client.running) await client.request("close", { session }).catch(() => {});
      }
    },
  };
}
