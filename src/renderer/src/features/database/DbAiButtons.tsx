import { Sparkles, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { dbAskPrompt } from "@shared/database/dbAsk";
import { previewRowsSql } from "@shared/database/dbFilter";
import { qualifiedTable, quoteName } from "@shared/database/dbEdit";
import { DB_TABLE_PAGE_ROWS, type DbConnection, type DbObjectPath, type DbRowFilter, type DbSort } from "@shared/types";
import { api } from "@/api";
import type { DbTableTab } from "@/lib/dbClientTabs";
import { promptDialog, reportFailure } from "@/ui/dialogs";
import { useDbClient } from "./dbClientContext";
import { startDbChat } from "./dbChat";
import { objectPathLabel } from "./dbFormat";
import type { SqlEditorHandle } from "./SqlEditor";

/** AI に見せない接続のときのボタンの説明 */
const AI_HIDDEN_TIP = "この接続は AI に見せない設定です（接続の編集の「チャットの AI に見せる」で変えられます）";

/** テーブルのタブの「SQL で開く」: いまの絞り込み・並べ替えのまま、データを読む SQL（場所つきの名前）を新しい SQL のタブに書いて開く */
export function OpenAsSqlButton({ connection, tab, filter, sort }: { connection: DbConnection; tab: DbTableTab; filter: DbRowFilter; sort: DbSort[] }) {
  const client = useDbClient();
  const open = () => {
    const sql = previewRowsSql(tab.name, filter, sort, (n) => quoteName(connection.engine, n), DB_TABLE_PAGE_ROWS, qualifiedTable(connection.engine, tab.path, tab.name));
    client.openSql(connection, `${sql};`);
  };
  return (
    <button type="button" className="btn btn-sm" onClick={open} data-tip="いまの絞り込み・並べ替えのまま、データを読む SQL を新しい SQL のタブで開く">
      <SquareTerminal size={13} aria-hidden /> SQL で開く
    </button>
  );
}

/** テーブルの「AI に聞く」（テーブルのタブ・ER 図の選んだテーブル）: 聞きたいことを入れてもらい、新しいチャットで聞く（中身は AI が kickoff_db のツールで読む） */
export function AskAiButton({ connection, path, tables, label = "AI に聞く" }: { connection: DbConnection; path: DbObjectPath; tables: string[]; label?: string }) {
  const client = useDbClient();
  const hidden = connection.ai_access === "none";
  const ask = async () => {
    const place = objectPathLabel(path) || "既定の場所";
    const question = await promptDialog({
      title: tables.length === 1 ? `「${tables[0]}」について AI に聞く` : `選んだ ${tables.length} 個のテーブルについて AI に聞く`,
      message: `新しいチャットで聞きます。AI はこの接続（${connection.name}）の構造と中身を、DB のツールで読んでから答えます${connection.ai_access === "ask" ? "（SQL を流す前に承認を聞きます）" : ""}。`,
      label: "聞きたいこと",
      placeholder: "例: 先月いちばん多く注文した人は？",
      confirmLabel: "チャットで聞く",
    });
    if (!question?.trim()) return;
    await startDbChat(client.projectId, dbAskPrompt(connection, place, tables, question), `DB「${tables.length > 3 ? `${tables.slice(0, 3).join("・")} ほか ${tables.length - 3} 個` : tables.join("・")}」について`).catch(reportFailure("チャットを作れませんでした"));
  };
  return (
    <button type="button" className="btn btn-sm" disabled={hidden || tables.length === 0} onClick={() => void ask()} data-tip={hidden ? AI_HIDDEN_TIP : "聞きたいことを新しいチャットで AI に聞く"}>
      <Sparkles size={13} aria-hidden /> {label}
    </button>
  );
}

/** SQL のタブの「AI に頼む」: 頼みを入れてもらい、接続の既定の場所のテーブルと列の名前（値は渡さない）といまの SQL から、AI に書いてもらった SQL を入力欄の終わりに足す */
export function SqlAssistButton({ connection, editor }: { connection: DbConnection; editor: React.RefObject<SqlEditorHandle | null> }) {
  const client = useDbClient();
  const [busy, setBusy] = useState(false);
  const hidden = connection.ai_access === "none";
  const run = async () => {
    const request = await promptDialog({
      title: "AI に SQL を書いてもらう",
      message: "テーブルと列の名前（中身の値は渡しません）と、いまの SQL を AI に渡します。書いてもらった SQL は入力欄の終わりに足します（流すのは確かめてから）。",
      label: "頼みたいこと",
      placeholder: "例: 先週の注文を店ごとに数えて、多い順に",
      confirmLabel: "頼む",
    });
    if (!request?.trim()) return;
    setBusy(true);
    try {
      const path = { database: connection.database, schema: null };
      const { sql } = await api.dbSqlAssist(client.projectId, connection.id, { path, request, sql: editor.current?.text() ?? "" }, client.worktreeOf(connection.id));
      editor.current?.append(sql);
    } catch (e) {
      void reportFailure("AI に頼めませんでした")(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="btn btn-sm" disabled={hidden || busy} onClick={() => void run()} data-tip={hidden ? AI_HIDDEN_TIP : "やりたいことを書くと、AI が SQL を書いて入力欄に足す"}>
      <Sparkles size={13} aria-hidden /> {busy ? "AI が書いています…" : "AI に頼む"}
    </button>
  );
}
