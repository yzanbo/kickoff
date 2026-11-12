import { Network, Pencil, Play, SquareTerminal, StickyNote, Trash2, Unplug } from "lucide-react";
import { errorMessage } from "@shared/errors";
import type { DbConnection } from "@shared/types";
import { api } from "@/api";
import type { Placement } from "@/lib/floating";
import { dbConnectionsStore } from "@/stores/dbConnections";
import { alertDialog, confirmDialog } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useDbClient } from "./dbClientContext";
import { disconnectConnection } from "./sqlSessions";

/** 接続の右クリック: SQL を開く・ER 図・手順メモ・準備のコマンド（あれば）・接続を切る・編集・消す */
export function ConnectionMenu({ at, connection: c, onClose }: { at: Placement; connection: DbConnection; onClose: () => void }) {
  const client = useDbClient();

  /** 「ER 図」: つないでいる DB（PostgreSQL は public のスキーマ）で開く */
  const openEr = async () => {
    try {
      const dbs = await api.dbDatabases(client.projectId, c.id, client.worktreeOf(c.id));
      const database = dbs.current ?? dbs.databases[0] ?? null;
      client.openEr(c, { database, schema: dbs.has_schemas ? "public" : null }, null);
    } catch (e) {
      await alertDialog("ER 図を開けませんでした", errorMessage(e));
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `接続「${c.name}」を消しますか？`,
      message: "保存したパスワードも消えます。DB の中身には触りません。",
      confirmLabel: "消す",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteDbConnection(client.projectId, c.id);
      dbConnectionsStore.invalidate(client.projectId);
    } catch (e) {
      await alertDialog("接続を消せませんでした", errorMessage(e));
    }
  };

  return (
    <PopupMenu at={at} label="接続のメニュー" onClose={onClose}>
      <MenuItem onSelect={() => client.openSql(c)}>
        <SquareTerminal size={14} /> SQL を開く
      </MenuItem>
      <MenuItem onSelect={() => void openEr()}>
        <Network size={14} /> ER 図
      </MenuItem>
      <MenuItem onSelect={() => client.openMemo(c)}>
        <StickyNote size={14} /> {c.memo_path ? "手順メモを開く" : "手順メモを作る…"}
      </MenuItem>
      {c.prep && (
        <MenuItem onSelect={() => client.showPrep({ connection: c })}>
          <Play size={14} /> {c.prep.prepare.length > 0 ? "準備のコマンドを流す…" : "つなぐときのコマンドを見る…"}
        </MenuItem>
      )}
      <MenuItem onSelect={() => void disconnectConnection(client.projectId, c)} title="つないでいる接続（木・テーブル・SQL のタブ）を閉じる。次に使えばつなぎ直す">
        <Unplug size={14} /> 接続を切る
      </MenuItem>
      <MenuItem onSelect={() => client.editConnection(c)}>
        <Pencil size={14} /> 編集…
      </MenuItem>
      <MenuItem danger onSelect={() => void remove()}>
        <Trash2 size={14} /> 消す…
      </MenuItem>
    </PopupMenu>
  );
}
