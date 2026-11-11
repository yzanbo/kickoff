// SQL のタブごとの、トランザクションの途中か（タブの列の「コミットしていない」印と、SQL のタブの帯で共通に読む）。画面の中だけ（ウィンドウを閉じれば消える。DB 側は閉じたら取り消す）
import { useSyncExternalStore } from "react";
import { errorMessage } from "@shared/errors";
import type { DbConnection } from "@shared/types";
import { api } from "@/api";
import { alertDialog, choiceDialog } from "@/ui/dialogs";

const pending = new Set<string>();
const listeners = new Set<() => void>();

/** そのタブがトランザクションの途中かを覚える（変わったときだけ知らせる） */
export function setSqlPending(key: string, inTransaction: boolean) {
  if (pending.has(key) === inTransaction) return;
  if (inTransaction) pending.add(key);
  else pending.delete(key);
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** そのタブがトランザクションの途中か */
export function useSqlPending(key: string): boolean {
  return useSyncExternalStore(subscribe, () => pending.has(key));
}

/**
 * SQL のタブを閉じる・切る前に、コミットしていなければ「コミット / 取り消す」を聞いてから接続を閉じる（取り消すなら接続を閉じて捨てる）。
 * やめたら false（タブを閉じない）
 */
export async function finishSession(projectId: number, c: DbConnection, session: string): Promise<boolean> {
  const { in_transaction } = await api.dbSessionState(projectId, c.id, session).catch(() => ({ in_transaction: false }));
  if (in_transaction) {
    const choice = await choiceDialog({
      title: "コミットしていない変更があります",
      message: `「${c.name}」で流した変更をコミットしますか？「取り消す」を選ぶと、変更は捨てます。`,
      choices: [
        { value: "commit", label: "コミット", primary: true },
        { value: "rollback", label: "取り消す" },
      ],
    });
    // やめたら閉じない
    if (choice === null) return false;
    try {
      if (choice === "commit") await api.commitDbSession(projectId, c.id, session);
    } catch (e) {
      await alertDialog("コミットできませんでした", errorMessage(e));
      return false;
    }
  }
  await api.closeDbSession(projectId, c.id, session).catch(() => {});
  return true;
}
