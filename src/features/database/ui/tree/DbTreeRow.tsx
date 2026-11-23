import { useState, type ReactNode } from "react";
import { DB_NOT_IN_WORKTREE, DB_PREP_UNCONFIRMED, DB_SSH_UNKNOWN_HOST, type DbConnection, type DbObjectKind, type DbObjectPath } from "@shared/database/types";
import { errorMessage } from "@shared/foundation/errors";
import type { TreeNode } from "@/foundation/ui/kit/list/tree";
import { ApiError } from "@/foundation/ui/api";
import { useDbClient, type DbClientActions } from "@/features/database/ui/state/dbClientContext";
import { SshHostKeyDialog } from "@/features/database/ui/connection/SshHostKeyDialog";
import type { TreeGet, TreeLoad } from "./useTreeLoads";

/**
 * 木の 1 行の見た目と操作（開閉の矢印・アイコン・名前・添える文）。押すと開閉か、葉なら onOpen。
 * openOnClick（テーブル・ビュー）は、名前を押すと開き（onOpen）、矢印を押す・→ / ← で中の段を開閉する
 */
export interface DbRowLook {
  icon: ReactNode;
  label: string;
  note?: string;
  /** 名前の後ろに添える小さな印（接続の手順ノートなど） */
  mark?: ReactNode;
  title?: string;
  className?: string;
  openOnClick?: boolean;
  onOpen?: () => void;
  /** ダブルクリック（テーブル・ビュー・関数・列挙型は、1 回押すと仮のタブ・ダブルクリックで固定） */
  onPin?: () => void;
  onMenu?: (e: React.MouseEvent) => void;
}

/** 木の 1 つ（読み込み中・空の案内 hint と、失敗の行 error も行にする） */
export interface DbTreeNode extends TreeNode<string> {
  children?: DbTreeNode[] | "lazy";
  row: DbRowLook | { hint: string } | { error: unknown; connection: DbConnection; retry: () => void };
}

/** 案内の行（読み込み中・空など） */
export const hintNode = (parent: string, hint: string): DbTreeNode => ({ key: `${parent}:hint`, row: { hint } });

/** 段の読み込みの行: 失敗なら失敗の行、届くまでは「読み込み中…」、届いたら build */
export function loadedNodes<T>(parent: string, load: TreeLoad<T>, connection: DbConnection, build: (data: T) => DbTreeNode[]): DbTreeNode[] {
  if (load.error !== undefined) return [{ key: `${parent}:error`, row: { error: load.error, connection, retry: load.reload } }];
  if (load.data === undefined) return [hintNode(parent, "読み込み中…")];
  return build(load.data);
}

/**
 * 読み込みの失敗の行（ワークツリーにファイルがなければ、本体のものを開くボタン。ほかの失敗は「直し方を見る」でつながらないときの案内。
 * onRetry: 案内の「つなぎ直す」で、この段を読み直す）
 */
export function TreeError({ error, connection, onRetry }: { error: unknown; connection: DbConnection; onRetry: () => void }) {
  const client = useDbClient();
  const [checkingKey, setCheckingKey] = useState(false);
  const code = error instanceof ApiError ? error.code : undefined;
  return (
    <>
      <span>{errorMessage(error)}</span>
      {code === DB_NOT_IN_WORKTREE ? (
        <button type="button" className="link-button small" onClick={() => client.openMain(connection.id)}>
          本体のものを開く
        </button>
      ) : code === DB_PREP_UNCONFIRMED ? (
        // つなぐときのコマンドをまだ確かめていない: 中身を見せて確かめたら読み直す
        <button type="button" className="link-button small" onClick={() => client.showPrep({ connection, retry: onRetry })}>
          コマンドを確かめる…
        </button>
      ) : code === DB_SSH_UNKNOWN_HOST && connection.ssh ? (
        // 初めてつなぐ踏み台: 鍵の指紋を確かめて受け入れたら読み直す
        <button type="button" className="link-button small" onClick={() => setCheckingKey(true)}>
          サーバーの鍵を確かめる…
        </button>
      ) : (
        <button type="button" className="link-button small" onClick={() => client.showFailure({ connection, error: errorMessage(error), retry: onRetry })}>
          直し方を見る
        </button>
      )}
      {checkingKey && connection.ssh && (
        <SshHostKeyDialog projectId={client.projectId} ssh={connection.ssh} onAccepted={onRetry} onClose={() => setCheckingKey(false)} />
      )}
    </>
  );
}

/** 右クリックした段（DB・スキーマ・テーブル。table があればテーブル・ビュー） */
export interface TreeMenuTarget {
  connection: DbConnection;
  path: DbObjectPath;
  table: { name: string; kind: DbObjectKind } | null;
}

/** 木を組むときに段の部品が使うもの（段の読み込み・開き具合・タブの開き方・右クリック） */
export interface DbTreeBuild {
  get: TreeGet;
  client: DbClientActions;
  isOpen(key: string): boolean;
  menu(e: React.MouseEvent, target: TreeMenuTarget): void;
}
