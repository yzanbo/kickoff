import { Copy, Network, Pencil, Play, PlugZap, SquareTerminal, StickyNote, Trash2, Unplug } from "lucide-react";
import { errorMessage } from "@shared/errors";
import type { DbConnection } from "@shared/types";
import { api } from "@/api";
import type { Placement } from "@/lib/floating";
import { dbConnectionsStore, useDbConnectedIds } from "@/stores/dbConnections";
import { alertDialog, confirmDialog } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useDbClient } from "./dbClientContext";
import { requestDbClient } from "./dbClientRequests";
import { disconnectConnection } from "./sqlSessions";

/** 接続の右クリック: 接続する / 接続を切る・SQL を開く・ER 図・手順メモ・準備のコマンド（あれば）・編集・写す・消す */
export function ConnectionMenu({ at, connection: c, onClose }: { at: Placement; connection: DbConnection; onClose: () => void }) {
  const client = useDbClient();
  const connected = useDbConnectedIds(client.projectId).data?.includes(c.id) ?? false;

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

  /** 「接続する」: 左の木で開き（閉じていた段を読むとつながる）、開いたままの木でもつなぎ直す（失敗は木の行に出る） */
  const connect = () => {
    requestDbClient(client.place, { kind: "focus", connectionId: c.id });
    api.dbDatabases(client.projectId, c.id, client.worktreeOf(c.id)).catch(() => undefined);
  };

  /** 「写す」: 同じプロジェクトに写し（名前に「のコピー」。パスワードも写す）、すぐ編集のダイアログで開く */
  const duplicate = async () => {
    try {
      const copied = await api.copyDbConnection(client.projectId, { from_id: c.id, copy_password: true });
      dbConnectionsStore.invalidate(client.projectId);
      client.editConnection(copied);
    } catch (e) {
      await alertDialog("接続を写せませんでした", errorMessage(e));
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
      {connected ? (
        <MenuItem onSelect={() => void disconnectConnection(client.projectId, c)} title="つないでいる接続（木・テーブル・SQL のタブ）を閉じる。次に使えばつなぎ直す">
          <Unplug size={14} /> 接続を切る
        </MenuItem>
      ) : (
        <MenuItem onSelect={connect} title="左の木でこの接続を開いて、つなぐ">
          <PlugZap size={14} /> 接続する
        </MenuItem>
      )}
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
      <MenuItem onSelect={() => client.editConnection(c)}>
        <Pencil size={14} /> 編集…
      </MenuItem>
      <MenuItem onSelect={() => void duplicate()} title="同じ設定（パスワード・手順メモも）で新しい接続を作り、編集を開く">
        <Copy size={14} /> 写す…
      </MenuItem>
      <MenuItem danger onSelect={() => void remove()}>
        <Trash2 size={14} /> 消す…
      </MenuItem>
    </PopupMenu>
  );
}
