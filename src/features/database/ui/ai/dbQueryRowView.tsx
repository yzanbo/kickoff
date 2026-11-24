// チャットのツールの行の見せ方（db_query）の部品。会話の画面の拡張点 toolRowViews に登録する（contributes.ts が遅れて読む）
import { HighlightedCode } from "@/foundation/ui/kit/HighlightedCode";
import type { ToolRowProps } from "@/features/conversation/ui";
import { DbQueryToolDetail } from "./DbQueryToolDetail";

/** 文字列の入力（なければ undefined） */
const strOf = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

/** 開いた中身: 流した SQL の全文と「SQL のタブで開く」 */
export function DbQueryRowDetail({ call, input, result }: ToolRowProps) {
  return <DbQueryToolDetail chatId={call.use.chat_id} sql={String(input.sql)} connectionName={strOf(input.connection)} result={result?.content} highlight />;
}

/** 承認カードの中身: SQL を切らずに全文 SQL の色で（確かめられるように） */
export function DbQuerySql({ input }: { input: Record<string, unknown> }) {
  return <HighlightedCode code={String(input.sql)} lang="sql" />;
}
