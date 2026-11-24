import type { Chat } from "@shared/chat/types";
import { PROVIDER_LABELS } from "@shared/settings/types";
import { knownChat } from "./store/knownChats";
import { chatsApi } from "@/features/chat/ui/api/chats";
import { chatTitle } from "./chatTitle";
import { choose, reportFailure } from "@/foundation/ui/kit/ask";
import { confirmArchiveChats, confirmDeleteChats, deleteChat } from "./chatActions";
import { readSetting, writeSetting, type SettingValue } from "@/foundation/ui/storage";
import { storage } from "./storage";

/** チャットの ✕ を押したときの扱い（ask = 毎回聞く / close = 表示だけ消す / archive = アーカイブ / delete = 削除） */
export const CHAT_CLOSE_ACTIONS = storage.settings.closeAction.choices;
export type ChatCloseAction = SettingValue<typeof storage.settings.closeAction>;

export const CHAT_CLOSE_ACTION_LABELS: Record<ChatCloseAction, string> = {
  ask: "毎回聞く",
  close: "表示だけ消す",
  archive: "アーカイブする",
  delete: "削除する",
};

/**
 * チャットの ✕（見出しの ✕・タブの ×）: 表示だけ消すか、アーカイブするか、削除するかを選んでから閉じる。
 * 既定を決めていればそのとおりにする（アーカイブ・削除は、既定でも確かめる）。
 * 聞いたときに「次からはこれにする」を付ければ、それを既定にする。close はパネル・タブを閉じる処理で、選んだ扱いを渡す
 * （サイドバーと連動したタブは、表示だけ消したときだけ出し直さないよう覚える。アーカイブ・削除はサイドバーの一覧に合わせて増減する）
 */
export async function closeChatWithChoice(
  chat: Pick<Chat, "id" | "title"> & Partial<Pick<Chat, "archived_at">>,
  close: (action: Exclude<ChatCloseAction, "ask">) => void,
) {
  // いまの既定（設定の「チャット」で変える。未保存なら毎回聞く）
  let action = readSetting(storage.settings.closeAction);
  let confirmed = false;
  if (action === "ask") {
    const archived = Boolean(chat.archived_at);
    const picked = await choose({
      title: `チャット「${chatTitle(chat.title)}」を閉じます`,
      message: `表示だけ消すと、チャットはサイドバーやボードに残ります。アーカイブすると一覧から隠れ（会話の記録は残ります）、削除すると会話の記録も消えます（${PROVIDER_LABELS[knownChat(chat.id)?.provider ?? "claude"]} の会話記録はゴミ箱へ移します）。`,
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
    if (picked.remember) writeSetting(storage.settings.closeAction, picked.value);
  }
  try {
    if (action === "archive") {
      // 既定をアーカイブにしていても、アーカイブは必ず確かめる（いま聞いた選択肢で選んだときは、それを確かめたことにする）。
      // やめたら閉じない
      if (!chat.archived_at) {
        if (confirmed) await chatsApi.archiveChat(chat.id, true);
        else if (!(await confirmArchiveChats({ id: chat.id, title: chat.title, archived_at: null }))) return;
      }
    } else if (action === "delete") {
      if (confirmed) await deleteChat(chat.id, chatTitle(chat.title));
      else if (!(await confirmDeleteChats(chat))) return;
    }
  } catch (e) {
    reportFailure(action === "delete" ? "削除できませんでした" : "アーカイブできませんでした")(e);
    return;
  }
  close(action);
}
