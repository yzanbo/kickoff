// SQL のタブごとの、トランザクションの途中か（タブの列の「コミットしていない」印と、SQL のタブの帯で共通に読む）。画面の中だけ（ウィンドウを閉じれば消える。DB 側は閉じたら取り消す）
import { errorMessage } from "@shared/errors";
import type { DbConnection } from "@shared/types";
import { api } from "@/api";
import { alertDialog, choiceDialog, confirmDialog } from "@/ui/dialogs";
import { createTabFlags } from "./tabFlags";

const pending = createTabFlags();

/** そのタブがトランザクションの途中かを覚える（変わったときだけ知らせる） */
export const setSqlPending = (key: string, inTransaction: boolean) => pending.set(key, inTransaction);

/** そのタブがトランザクションの途中か */
export const useSqlPending = (key: string): boolean => pending.useFlag(key);

/**
 * SQL のタブを閉じる・切る前に、コミットしていなければ「コミット / 取り消す」を聞いてから接続を閉じる（取り消すなら接続を閉じて捨てる）。
 * やめたら false（タブを閉じない）
 */
export async function finishSession(projectId: number, c: DbConnection, session: string, title = "コミットしていない変更があります"): Promise<boolean> {
  const { in_transaction } = await api.dbSessionState(projectId, c.id, session).catch(() => ({ in_transaction: false }));
  if (in_transaction) {
    const choice = await choiceDialog({
      title,
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
  setSqlPending(session, false);
  return true;
}

/**
 * 接続を切る（木・テーブル・SQL のタブ・AI のワーカーの接続をすべて閉じる。次に使えばつなぎ直す）。
 * コミットしていない SQL のタブがあれば、取り消して切るか聞く（やめたら切らない）
 */
export async function disconnectConnection(projectId: number, c: DbConnection): Promise<void> {
  try {
    let result = await api.disconnectDb(projectId, c.id, false);
    if (!result.disconnected) {
      const ok = await confirmDialog({
        title: "コミットしていない SQL のタブがあります",
        message: `「${c.name}」の SQL のタブ ${result.pending_sessions.length} 個に、コミットしていない変更があります。取り消して切りますか？（コミットするなら、先にそのタブでコミットしてください）`,
        confirmLabel: "取り消して切る",
        danger: true,
      });
      if (!ok) return;
      result = await api.disconnectDb(projectId, c.id, true);
    }
    for (const session of result.pending_sessions) setSqlPending(session, false);
  } catch (e) {
    await alertDialog("接続を切れませんでした", errorMessage(e));
  }
}
