import { Sparkles } from "lucide-react";
import { isAiVisible } from "@shared/database/aiVisibility";
import type { DbConnection } from "@shared/database/types";
import { dbApi, dbAt } from "@/features/database/ui/api";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { prompt, reportFailure } from "@/foundation/ui/kit/ask";
import { AI_HIDDEN_TIP } from "@/features/database/ui/ai/DbAiButtons";
import { useDbClient } from "@/features/database/ui/state/dbClientContext";
import type { SqlEditorHandle } from "./SqlEditor";

/** SQL のタブの「AI に頼む」: 頼みを入れてもらい、接続の既定の場所のテーブルと列の名前（値は渡さない）といまの SQL から、AI に書いてもらった SQL を入力欄の終わりに足す */
export function SqlAssistButton({ connection, editor }: { connection: DbConnection; editor: React.RefObject<SqlEditorHandle | null> }) {
  const client = useDbClient();
  const action = useAction<"ask">();
  const busy = action.busy !== null;
  const hidden = !isAiVisible(connection);
  const run = async () => {
    const request = await prompt({
      title: "AI に SQL を書いてもらう",
      message: "テーブルと列の名前（中身の値は渡しません）と、いまの SQL を AI に渡します。書いてもらった SQL は入力欄の終わりに足します（流すのは確かめてから）。",
      label: "頼みたいこと",
      placeholder: "例: 先週の注文を店ごとに数えて、多い順に",
      confirmLabel: "頼む",
    }).then((r) => r?.value ?? null);
    if (!request?.trim()) return;
    // 失敗はお知らせで出す
    await action.run("ask", () => askAi(request).catch((e: unknown) => void reportFailure("AI に頼めませんでした")(e)));
  };
  /** AI に書いてもらった SQL を入力欄の終わりに足す（失敗は投げる） */
  const askAi = async (request: string) => {
    const path = { database: connection.database, schema: null };
    const { sql } = await dbApi("POST /api/projects/:projectId/db-connections/:connectionId/sql-assist", { ...dbAt(client.projectId, connection.id, client.worktreeOf(connection.id)), body: { path, request, sql: editor.current?.text() ?? "" } });
    editor.current?.append(sql);
  };
  return (
    <button type="button" className="btn" data-size="sm" disabled={hidden || busy} onClick={() => void run()} data-tip={hidden ? AI_HIDDEN_TIP : "やりたいことを書くと、AI が SQL を書いて入力欄に足す"}>
      <Sparkles size={13} aria-hidden /> {busy ? "AI が書いています…" : "AI に頼む"}
    </button>
  );
}
