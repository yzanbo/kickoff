// チャットの AI が、このプロジェクトの DB の接続の SQL のタブを画面に開く（kickoff_chat の open_sql の中身。プロバイダーに依らない。P5-4h で database へ）。
// 開く・入れるだけで流さないので、聞かずに頼む（権限モード・Auto mode によらず承認カードを出さない）。コアは確かめてから SSE の open_view で頼む（画面が開いたかは待たない）
import type { OpenSqlInput } from "@shared/chat/aiOpen";
import type { BusEvent } from "@shared/foundation/contract";
import type { Store } from "@/features/chat/core/stores";
import { lineageOf } from "./aiChatEdit";
import { toolChat } from "./context";

/** SQL を開くツールの中身（AI に返す文。開けなければ理由の文で throw） */
interface AiOpenTools {
  openSql(input: OpenSqlInput): string;
}

/** SQL の長さの上限 */
const SQL_MAX = 100_000;

export interface AiOpenDeps {
  store: Store;
  /** 画面に頼む（SSE） */
  publish: (event: BusEvent) => void;
  /** プロジェクトの DB の接続（database の店。なければ open_sql で選べる接続はない） */
  dbConnectionsOf?: (projectId: number) => { id: number; name: string; ai_access: string }[];
}

/** chatId のチャットの AI に渡す、SQL のタブを開くツールの中身。接続は呼ぶたびに引き直す */
export function createAiOpenTools({ store, publish, dbConnectionsOf }: AiOpenDeps, chatId: number): AiOpenTools {
  const { self: requireSelf } = toolChat(store.chats, chatId);
  return {
    openSql(input) {
      const self = requireSelf();
      const sql = input.sql.trim();
      if (!sql) throw new Error("sql が空です");
      if (sql.length > SQL_MAX) throw new Error(`sql は ${SQL_MAX} 文字までです`);
      // 「AI に見せない」接続は選ばせない（名前も出さない）
      const shown = (dbConnectionsOf?.(self.project_id) ?? []).filter((c) => c.ai_access !== "none");
      const name = input.connection?.trim();
      const hit = name ? (shown.find((c) => c.name === name) ?? shown.find((c) => c.name.toLowerCase() === name.toLowerCase())) : shown.length === 1 ? shown[0] : undefined;
      if (!hit) {
        if (shown.length === 0) throw new Error("このプロジェクトには、AI に見せる DB の接続がありません。");
        if (!name) throw new Error(`connection に接続の名前を渡してください（AI に見せる接続: ${shown.map((c) => c.name).join("、")}）。`);
        throw new Error(`「${name}」という AI に見せる接続はありません（AI に見せる接続: ${shown.map((c) => c.name).join("、")}。利用者が AI に見せないと決めた接続は選べません）。`);
      }
      publish({ type: "open_view", request: { kind: "sql", project_id: self.project_id, connection_id: hit.id, sql, lineage: lineageOf(store, self) } });
      return `接続「${hit.name}」の新しい SQL のタブに SQL を入れて開くよう、画面に頼みました（流していません。流すのは利用者です）。`;
    },
  };
}
