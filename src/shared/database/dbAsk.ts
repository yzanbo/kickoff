// DB クライアントの「AI に聞く」（テーブルのタブ・ER 図の選んだテーブル）で、新しいチャットに送る文
import { DB_ENGINE_LABELS, DB_ENVIRONMENT_LABELS, type DbConnection } from "../types/database";

/**
 * テーブルについて AI に聞く文: 接続の名前（AI のツールで指す名前）・場所・テーブルと、利用者の問い。
 * 中身は AI が kickoff_db のツールで読む（ここには値を入れない）
 */
export function dbAskPrompt(c: Pick<DbConnection, "name" | "engine" | "environment">, place: string, tables: string[], question: string): string {
  const target = tables.length === 1 ? `テーブル「${tables[0]}」` : `テーブル ${tables.map((t) => `「${t}」`).join("・")}`;
  return [
    `DB の接続「${c.name}」（${DB_ENGINE_LABELS[c.engine]} · ${DB_ENVIRONMENT_LABELS[c.environment]}）の ${place} にある${target}について聞きます。`,
    `kickoff_db のツール（db_describe で構造、db_query で読み取りの SQL）で、この接続（connection は「${c.name}」）を確かめてから答えてください。書き込む SQL は流さないでください。`,
    "",
    question.trim(),
  ].join("\n");
}
