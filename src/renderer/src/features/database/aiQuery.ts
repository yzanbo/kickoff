// チャットの AI の db_query（kickoff_db）の入力を、DB クライアントの接続に結び付ける。React に依らない
import type { DbConnection } from "@shared/types";

/** db_query の結果の文の頭「接続「名前」の結果。」（core/databases/aiFormat.ts）から、流した接続の名前を読む */
function nameFromResult(result: string | undefined): string | undefined {
  return result ? /^接続「(.+?)」の結果/.exec(result)?.[1] : undefined;
}

/**
 * db_query の SQL を流した接続: 入力に名前があればその名前の接続、省いていれば結果の文の名前、それもなければ AI に見せる接続が 1 つだけのときのそれ
 * （分からなければ null。接続の名前を変えた・消したときも null）
 */
export function aiQueryConnection(connections: readonly DbConnection[], name: string | undefined, result?: string): DbConnection | null {
  const named = name ?? nameFromResult(result);
  if (named) return connections.find((c) => c.name === named) ?? null;
  const shown = connections.filter((c) => c.ai_access !== "none");
  return shown.length === 1 ? shown[0] : null;
}
