import { useState } from "react";
import type { TabBase } from "@/features/panel/ui/kind";
import { kindOf } from "@/features/panel/ui/state/panelStore";

/**
 * タブの名前をその場で変える（パネル全体で 1 つ。タブの名前のダブルクリック・Enter と、右クリックの「名前を変更」で共通。ダイアログは出さない）。
 * 変えられるのは種類が rename を持つタブ（チャット・子チャット・送る前の新しいチャット）。初めの値・上限・決め方は種類の項目
 */
export function useTabRename() {
  const [editing, setEditing] = useState<string | null>(null);
  const stop = () => setEditing(null);
  return {
    /** 名前を変えられるタブか */
    canRename: (tab: TabBase) => kindOf(tab).rename !== undefined,
    start: (tabKey: string) => setEditing(tabKey),
    /** そのタブの名前を変えている途中なら、タブの名前の入力欄（InlineName）に渡す初めの値・決定・取り消し */
    editorFor: (panelKey: string, tab: TabBase) => {
      const rename = kindOf(tab).rename;
      if (editing !== tab.key || !rename) return undefined;
      return {
        initial: rename.initial(tab),
        maxLength: rename.max,
        onSubmit: (name: string) => {
          stop();
          rename.submit(tab, name, panelKey);
        },
        onCancel: stop,
      };
    },
  };
}

export type TabRename = ReturnType<typeof useTabRename>;
