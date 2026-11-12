import { useEffect, useMemo, useRef, useState } from "react";
import { editKeyColumns, editStatements } from "@shared/database/dbEdit";
import { errorMessage } from "@shared/errors";
import { DB_EDITS_MAX, DB_ENVIRONMENT_LABELS, type DbConnection, type DbTableDetail } from "@shared/types";
import { api } from "@/api";
import type { DbTableTab } from "@/lib/dbClientTabs";
import { registerSavable } from "@/lib/saveAll";
import { confirmDialog } from "@/ui/dialogs";
import { useDbClient } from "./dbClientContext";
import { unsavedKey, unsavedTables } from "./tabFlags";
import { buildEdits, editCounts, NO_EDITS, type TableEdits } from "./tableEdits";
import { clipSql, confirmByEnvName, useSqlWrite } from "./useSqlWrite";

/**
 * テーブルのタブのまだ保存していない変更（段階 3）。タブを開いている間だけ持つ（データと構造を切り替えても残す。閉じるときは捨てるか聞く）。
 * 保存は流す SQL を見せて確かめてから 1 つのトランザクションで（⌘S・⌘⇧S のすべて保存も）。読み取り専用の接続は「書き込む」の間だけ書き換えられる
 */
export function useTableEdits(tab: DbTableTab, connection: DbConnection, detail: DbTableDetail | undefined, worktree: string | null, onSaved: () => void) {
  const client = useDbClient();
  const [edits, setEdits] = useState<TableEdits>(NO_EDITS);
  // 保存は、書き直している欄を決めた直後のいちばん新しい変更で（描き直しを待たない）
  const latest = useRef(edits);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const write = useSqlWrite(connection, false);
  const keyColumns = useMemo(() => (detail ? editKeyColumns(detail) : null), [detail]);
  const counts = editCounts(edits);
  const flag = unsavedKey(client.place, tab.key);
  const dirty = counts.total > 0;

  useEffect(() => unsavedTables.set(flag, dirty), [flag, dirty]);
  useEffect(() => () => unsavedTables.set(flag, false), [flag]);

  /** 変更を足す・直す（書き込むの 10 分を数え直す） */
  const change = (f: (e: TableEdits) => TableEdits) => {
    const next = f(latest.current);
    latest.current = next;
    setEdits(next);
    setError(undefined);
    write.touch();
  };

  const save = async (): Promise<boolean> => {
    // 書き直している欄があれば、先に決める（欄の blur で変更に入る）
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement && active.classList.contains("db-grid-editor")) active.blur();
    const current = latest.current;
    const n = editCounts(current).total;
    if (n === 0 || saving) return true;
    if (connection.read_only && !write.on) {
      setError("読み取り専用の接続です。保存するには、上の「書き込む…」で読み取り専用を外してください");
      return false;
    }
    if (n > DB_EDITS_MAX) {
      setError(`1 回に保存できる変更は ${DB_EDITS_MAX.toLocaleString()} 件までです（いま ${n.toLocaleString()} 件）`);
      return false;
    }
    try {
      const list = buildEdits(current, keyColumns);
      const sql = editStatements(connection.engine, tab.path, tab.name, list)
        .map((s) => `${s.preview};`)
        .join("\n");
      const title = `「${connection.name}」（${DB_ENVIRONMENT_LABELS[connection.environment]}）の ${tab.name} に ${n.toLocaleString()} 件の変更を保存しますか？`;
      const message = `${clipSql(sql)}\n\n1 つのトランザクションで流し、1 つでも失敗したらすべて取り消します。`;
      // 保存はいつも SQL を見せて確かめる。読み取り専用でなく「環境の名前を打たないと流せない」の接続は、名前も打たせる
      const ok =
        !write.on && connection.write_check === "env_name"
          ? await confirmByEnvName(connection, title, message, "保存")
          : await confirmDialog({ title, message, confirmLabel: "保存", danger: write.on || connection.environment === "production" });
      if (!ok) return false;
      setSaving(true);
      await api.saveDbEdits(client.projectId, connection.id, { path: tab.path, table: tab.name, edits: list, write: write.on }, worktree);
      latest.current = NO_EDITS;
      setEdits(NO_EDITS);
      write.touch();
      onSaved();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** 変更をすべて捨てる（確かめてから） */
  const discard = async () => {
    if (!dirty) return;
    const ok = await confirmDialog({ title: "保存していない変更を取り消しますか？", message: `${counts.total.toLocaleString()} 件の変更を捨てます。`, confirmLabel: "取り消す", danger: true });
    if (!ok) return;
    latest.current = NO_EDITS;
    setEdits(NO_EDITS);
    setError(undefined);
  };

  // ⌘⇧S のすべて保存にも知らせる
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => registerSavable({ dirty: () => editCounts(latest.current).total > 0, save: () => saveRef.current() }), []);

  const isTable = detail?.kind === "table";
  return {
    edits,
    counts,
    keyColumns,
    /** 書き換えられるか（テーブルで、読み取り専用でないか書き込むの間） */
    writable: isTable && (!connection.read_only || write.on),
    isTable,
    write,
    saving,
    error,
    change,
    save,
    discard,
  };
}

export type TableEditsState = ReturnType<typeof useTableEdits>;
