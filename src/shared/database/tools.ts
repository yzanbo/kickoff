// DB の AI のツール（kickoff_db の 4 つと kickoff_chat の open_sql）の、画面とスマホに出す表示名と記録の行の文
import { aiToolId, aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";
import { AI_OPEN_SQL_TOOL, describeOpenSql } from "@shared/chat/aiOpen";

const str = (value: unknown): string => (typeof value === "string" ? value : "");
/** 接続の名前を頭に付ける（「開発: users」） */
const onConnection = (input: Record<string, unknown>, text: string) => (str(input.connection) ? (text ? `${str(input.connection)}: ${text}` : str(input.connection)) : text);
const view = (name: string, label: string, describe?: AiToolView["describe"]): AiToolView => ({ server: "kickoff_db", name, label, describe });

/** SQL を流すツールの記録の名前（チャットのツールの行で中身を出し分ける） */
export const AI_DB_QUERY_TOOL = aiToolId({ server: "kickoff_db", name: "db_query" });

/** DB の機能のツールの表示の表 */
export const DB_TOOL_VIEWS: readonly AiToolView[] = [
  aiToolViewOf(AI_OPEN_SQL_TOOL, "SQL のタブに入れる", describeOpenSql),
  view("db_connections", "DB の接続を確かめる"),
  view("db_objects", "DB のテーブルを確かめる", (input) => onConnection(input, str(input.search))),
  view("db_describe", "テーブルの構造を読む", (input) => onConnection(input, str(input.table))),
  view("db_query", "SQL を流す", (input) => onConnection(input, str(input.sql).trim().split("\n")[0] ?? "")),
];
