// DB クライアントの中の部品（木・テーブルのタブ・SQL のタブ）に、置き場所・作業場所・タブの開き方を渡す口
import { createContext, useContext } from "react";
import type { DbConnection, DbObjectKind, DbObjectPath, DbRowFilter } from "@shared/types";

export interface DbClientActions {
  projectId: number;
  /** 置き場所（project-<ID> / chat-<ID> / popout-<ID>。タブ・木の開き具合・書きかけの SQL を置き場所ごとに覚える） */
  place: string;
  /** その接続を開く作業場所（SQLite のファイルをワークツリーで開く。本体を選び直した接続は null） */
  worktreeOf(connectionId: number): string | null;
  /** ワークツリーにファイルがない接続を、本体のファイルで開き直す */
  useMain(connectionId: number): void;
  /** テーブルのタブを開く（filter を渡せばその絞り込みで。外部キーで移るとき） */
  openTable(connection: DbConnection, path: DbObjectPath, name: string, object: DbObjectKind, filter?: DbRowFilter): void;
  openSql(connection: DbConnection): void;
  /** ER 図のタブを開く（focus があればそのテーブルのまわりだけ） */
  openEr(connection: DbConnection, path: DbObjectPath, focus: string | null): void;
  /** 接続の登録・編集のダイアログ（null なら新しく作る） */
  editConnection(connection: DbConnection | null): void;
}

export const DbClientContext = createContext<DbClientActions | null>(null);

export function useDbClient(): DbClientActions {
  const value = useContext(DbClientContext);
  if (!value) throw new Error("DB クライアントの中で使ってください");
  return value;
}
