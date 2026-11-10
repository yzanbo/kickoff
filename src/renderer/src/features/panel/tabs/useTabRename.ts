import { useState } from "react";
import { api } from "@/api";
import { reportFailure } from "@/ui/dialogs";
import { CHAT_TITLE_MAX } from "@/features/chat/chatTitle";
import { setDraftTitle } from "@/features/panel/state/panelDrafts";
import type { PanelTab } from "./panelTypes";

/**
 * タブの名前をその場で変える（パネル全体で 1 つ。タブの名前のダブルクリック・Enter と、右クリックの「名前を変更」で共通。ダイアログは出さない）。
 * 変えられるのはチャットのタブ（名前を変える API）と、送る前の新しいチャットのタブ（送ったらその名前のチャットになる。setDraftTitle）
 */
export function useTabRename() {
  const [editing, setEditing] = useState<string | null>(null);
  const stop = () => setEditing(null);
  return {
    /** 名前を変えられるタブか */
    canRename: (tab: PanelTab) => tab.kind === "chat" || tab.kind === "new",
    start: (tabKey: string) => setEditing(tabKey),
    /** そのタブの名前を変えている途中なら、タブの名前の入力欄（InlineName）に渡す初めの値・決定・取り消し */
    editorFor: (panelKey: string, tab: PanelTab) => {
      if (editing !== tab.key) return undefined;
      if (tab.kind === "chat")
        return {
          initial: tab.title ?? "",
          maxLength: CHAT_TITLE_MAX,
          onSubmit: (title: string) => {
            stop();
            void api.renameChat(tab.id, title).catch(reportFailure("名前を変更できませんでした"));
          },
          onCancel: stop,
        };
      if (tab.kind === "new")
        return {
          initial: tab.title ?? "",
          maxLength: CHAT_TITLE_MAX,
          onSubmit: (title: string) => {
            stop();
            setDraftTitle({ panel: panelKey, key: tab.key }, title);
          },
          onCancel: stop,
        };
      return undefined;
    },
  };
}

export type TabRename = ReturnType<typeof useTabRename>;
