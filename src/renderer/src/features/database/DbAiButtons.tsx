import { Sparkles, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { dbAskPrompt } from "@shared/database/dbAsk";
import { previewRowsSql } from "@shared/database/dbFilter";
import { qualifiedTable, quoteName } from "@shared/database/dbEdit";
import { DB_TABLE_PAGE_ROWS, type DbConnection, type DbObjectPath, type DbRowFilter, type DbSort } from "@shared/types";
import { api } from "@/api";
import type { DbTableTab } from "@/lib/dbClientTabs";
import { useChats, useKnownChat } from "@/stores/chats";
import { promptDialog, promptWithSelect, reportFailure } from "@/ui/dialogs";
import { chatTitle } from "@/features/chat/chatTitle";
import { useMainChat } from "@/features/chat/pane/mainChatContext";
import { useDbClient } from "./dbClientContext";
import { askDbInChat, startDbChat } from "./dbChat";
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

/** 「AI に聞く」で選べるいまあるチャットの数（最近動いた順） */
const ASK_CHAT_CHOICES = 15;

/**
 * テーブルの「AI に聞く」（テーブルのタブ・ER 図の選んだテーブル）: 聞きたいことと聞く先（新しいチャット・このチャット・最近動いたチャット）を選んでもらい、
 * そのまま送る（書き終えた時点で送るつもりがあるので、入力欄では止めない。いまあるチャットが作業中なら送信待ちに入れる）。中身は AI が kickoff_db のツールで読む
 */
export function AskAiButton({ connection, path, tables, label = "AI に聞く" }: { connection: DbConnection; path: DbObjectPath; tables: string[]; label?: string }) {
  const client = useDbClient();
  const hidden = connection.ai_access === "none";
  const mainChatId = useMainChat();
  const mainChat = useKnownChat(mainChatId ?? 0);
  const { chats } = useChats({ projectId: client.projectId });
  const ask = async () => {
    const place = objectPathLabel(path) || "既定の場所";
    const targets = [...(mainChat && mainChat.archived_at === null ? [mainChat] : []), ...chats.filter((c) => c.id !== mainChat?.id && c.archived_at === null).slice(0, ASK_CHAT_CHOICES)];
    const answer = await promptWithSelect({
      title: tables.length === 1 ? `「${tables[0]}」について AI に聞く` : `選んだ ${tables.length} 個のテーブルについて AI に聞く`,
      message: `AI はこの接続（${connection.name}）の構造と中身を、DB のツールで読んでから答えます${connection.ai_access === "ask" ? "（SQL を流す前に承認を聞きます）" : ""}。決めたらすぐ送ります（作業中のチャットなら送信待ちに入れます）。`,
      label: "聞きたいこと",
      placeholder: "例: 先月いちばん多く注文した人は？",
      confirmLabel: "チャットで聞く",
      select: {
        label: "聞く先",
        initial: "new",
        options: [
          { value: "new", label: "新しいチャット" },
          ...targets.map((c) => ({ value: String(c.id), label: c.id === mainChat?.id ? `このチャット（${chatTitle(c.title)}）` : chatTitle(c.title) })),
        ],
      },
    });
    if (!answer?.value.trim()) return;
    const text = dbAskPrompt(connection, place, tables, answer.value);
    const chat = targets.find((c) => String(c.id) === answer.selected);
    const fail = reportFailure(chat ? "チャットに送れませんでした" : "チャットを作れませんでした");
    if (chat) return askDbInChat(chat, text).catch(fail);
    await startDbChat(client.projectId, text, `DB「${tables.length > 3 ? `${tables.slice(0, 3).join("・")} ほか ${tables.length - 3} 個` : tables.join("・")}」について`).catch(fail);
  };
  return (
    <button type="button" className="btn btn-sm" disabled={hidden || tables.length === 0} onClick={() => void ask()} data-tip={hidden ? AI_HIDDEN_TIP : "聞きたいことを書いて、新しいチャットか選んだチャットで AI に聞く（すぐ送る）"}>
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
