import { useState } from "react";
import type { Chat } from "@shared/types";
import { api } from "@/api";
import { alertDialog } from "@/ui/dialogs";
import { errorMessage } from "@shared/errors";

/** 名前を変えられなかったときの既定の知らせ方（お知らせのダイアログ） */
const alertRenameFailure = (message: string) => void alertDialog("名前を変更できませんでした", message);

/** チャットの名前をその場で変える（右クリックメニューの「名前を変更」から。ダイアログは出さない）。onError を省くとお知らせで出す */
export function useChatRename(onError: (message: string) => void = alertRenameFailure) {
  const [renamingId, setRenamingId] = useState<number | null>(null);
  return {
    start: (chat: Chat) => setRenamingId(chat.id),
    /** そのチャットの名前を変えている途中なら、名前の入力欄（InlineName）に渡す決定・取り消し */
    editorFor: (chat: Chat) =>
      renamingId === chat.id
        ? {
            onSubmit: (title: string) => {
              setRenamingId(null);
              void api.renameChat(chat.id, title).catch((e: unknown) => onError(errorMessage(e)));
            },
            onCancel: () => setRenamingId(null),
          }
        : undefined,
  };
}

export type ChatTitleEditor = NonNullable<ReturnType<ReturnType<typeof useChatRename>["editorFor"]>>;
