import type { Run } from "../../../../core/types";
import { api } from "../../api";
import { chatTitle } from "../../chatTitle";
import { choiceDialogWithRemember } from "../../dialogs";
import { confirmDeleteRun, deleteRun, reportFailure, toggleArchiveRun } from "../../runActions";
import { CHAT_CLOSE_ACTION_KEY } from "../../storageKeys";

/** チャットの ✕ を押したときの扱い（ask = 毎回聞く / close = 表示だけ消す / archive = アーカイブ / delete = 削除） */
export const CHAT_CLOSE_ACTIONS = ["ask", "close", "archive", "delete"] as const;
export type ChatCloseAction = (typeof CHAT_CLOSE_ACTIONS)[number];

export const CHAT_CLOSE_ACTION_LABELS: Record<ChatCloseAction, string> = {
  ask: "毎回聞く",
  close: "表示だけ消す",
  archive: "アーカイブする",
  delete: "削除する",
};

/** いまの既定（設定の「チャット」で変える。未保存・知らない値なら毎回聞く） */
function storedCloseAction(): ChatCloseAction {
  const raw = localStorage.getItem(CHAT_CLOSE_ACTION_KEY);
  return CHAT_CLOSE_ACTIONS.includes(raw as ChatCloseAction) ? (raw as ChatCloseAction) : "ask";
}

/**
 * チャットの ✕（見出しの ✕・タブの ×）: 表示だけ消すか、アーカイブするか、削除するかを選んでから閉じる。
 * 既定を決めていればそのとおりにする（アーカイブ・削除は、既定でも確かめる）。
 * 聞いたときに「次からはこれにする」を付ければ、それを既定にする。close はパネル・タブを閉じる処理で、選んだ扱いを渡す
 * （サイドバーと連動したタブは、表示だけ消したときだけ出し直さないよう覚える。アーカイブ・削除はサイドバーの一覧に合わせて増減する）
 */
export async function closeChatWithChoice(
  run: Pick<Run, "id" | "title"> & Partial<Pick<Run, "archived_at">>,
  close: (action: Exclude<ChatCloseAction, "ask">) => void,
) {
  let action = storedCloseAction();
  let confirmed = false;
  if (action === "ask") {
    const archived = Boolean(run.archived_at);
    const picked = await choiceDialogWithRemember({
      title: `チャット「${chatTitle(run.title)}」を閉じます`,
      message: "表示だけ消すと、チャットはサイドバーやボードに残ります。アーカイブすると一覧から隠れ（会話の記録は残ります）、削除すると会話の記録も消えます。",
      choices: [
        { value: "close", label: "表示だけ消す", primary: true },
        ...(archived ? [] : [{ value: "archive" as const, label: "アーカイブ" }]),
        { value: "delete", label: "削除", danger: true },
      ],
      remember: "次からはこれにする（設定の「チャット」で変えられます）",
    });
    if (!picked) return;
    action = picked.value;
    // 選んだ時点で確かめたことにする（削除をもう一度聞かない）
    confirmed = true;
    if (picked.remember) localStorage.setItem(CHAT_CLOSE_ACTION_KEY, picked.value);
  }
  try {
    if (action === "archive") {
      // 既定をアーカイブにしていても、アーカイブは必ず確かめる（いま聞いた選択肢で選んだときは、それを確かめたことにする）。
      // やめたら閉じない
      if (!run.archived_at) {
        if (confirmed) await api.archiveRun(run.id, true);
        else if (!(await toggleArchiveRun({ id: run.id, title: run.title, archived_at: null }))) return;
      }
    } else if (action === "delete") {
      if (confirmed) await deleteRun(run.id);
      else if (!(await confirmDeleteRun(run))) return;
    }
  } catch (e) {
    reportFailure(action === "delete" ? "削除できませんでした" : "アーカイブできませんでした")(e);
    return;
  }
  close(action);
}
