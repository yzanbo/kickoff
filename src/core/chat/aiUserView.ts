// チャットの AI が利用者の見ている画面を読む（kickoff_chat の get_user_view の中身。プロバイダーに依らない。メモの仕様書「0019_AI の操作ツールの追加」の D）。
// 読むのは、このチャットを開いているウィンドウ（なければ最後に前に出したウィンドウ）のいまの様子と、このチャットの最後の発言を送ったときの様子。
// ほかのプロジェクトを見ていれば中身は返さない（Q3）。読むだけなので聞かずに返す
import type { Store } from "../db/store.js";
import { userViewText } from "../userView/format.js";
import type { UserViewRegistry } from "../userView/registry.js";

/** 利用者が見ているものを読むツールの中身（AI に返す文。1 行目は記録の行の文） */
export interface AiUserViewTools {
  read(): string;
}

export function createAiUserViewTools(deps: { store: Store; userViews: UserViewRegistry; now?: () => number }, chatId: number): AiUserViewTools {
  const { store, userViews } = deps;
  return {
    read() {
      const chat = store.chats.get(chatId);
      if (!chat) throw new Error("このチャットが見つかりません（消された可能性があります）");
      return userViewText({
        chatId,
        projectId: chat.project_id,
        projectName: (id) => store.projects.get(id)?.name ?? `プロジェクト ${id}`,
        current: userViews.currentFor(chatId),
        sent: userViews.sentFor(chatId),
        now: (deps.now ?? Date.now)(),
      });
    },
  };
}
