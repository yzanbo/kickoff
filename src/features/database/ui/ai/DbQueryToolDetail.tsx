import { SquareTerminal } from "lucide-react";
import { useDbConnections } from "@/features/database/ui/state/connectionsStore";
import { useKnownChat } from "@/features/chat/ui";
import { HighlightedCode } from "@/foundation/ui/kit/HighlightedCode";
import { aiQueryConnection } from "./aiQuery";
import { openSqlInChat } from "./openSqlInChat";

/**
 * チャットのツールの行を開いた中身（db_query）: 流した SQL を全文 SQL の色で（承認カードと同じ）と、「SQL のタブで開く」
 * （そのチャットの右の欄の DB クライアントに、同じ接続の新しい SQL のタブを足して SQL を書く。この Mac のアプリの中だけ）。
 * 結果の文はツールの行がこの下に出す。highlight: 開いてから色を付ける
 */
export function DbQueryToolDetail({ chatId, sql, connectionName, result, highlight }: { chatId: number; sql: string; connectionName: string | undefined; result: string | undefined; highlight: boolean }) {
  const chat = useKnownChat(chatId);
  // DB の API はこの Mac からだけ受けるので、ブラウザ（スマホ）では接続を読まない
  const local = Boolean(window.kickoff);
  const enabled = local && chat !== undefined;
  const connections = useDbConnections(chat?.project_id ?? 0, enabled).data ?? [];
  const connection = aiQueryConnection(connections, connectionName, result);
  return (
    <>
      <pre className="tool-output tool-db-sql">
        <HighlightedCode code={sql} lang={highlight ? "sql" : undefined} />
      </pre>
      {local && chat && (
        <div className="tool-actions">
          <button
            type="button"
            className="btn"
            data-size="sm"
            disabled={!connection}
            title={connection ? `「${connection.name}」の新しい SQL のタブで、この SQL を開く（右の欄の DB）` : "どの接続で流した SQL か分かりません（接続の名前が変わったか、消えました）"}
            onClick={() => connection && openSqlInChat(chat, connection, sql)}
          >
            <SquareTerminal size={13} aria-hidden /> SQL のタブで開く
          </button>
        </div>
      )}
    </>
  );
}
