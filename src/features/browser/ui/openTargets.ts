// ブラウザで開く行き先（open({ kind: "browser" })。ターミナルの ⌘クリック・Docker・ワークツリー・本文のリンクの「ブラウザで開く」）
import type { OpenTargetHandler } from "@/foundation/ui/navigation/open";
import { openSideBrowser } from "./panel/openBrowserTab";

declare module "@/foundation/ui/navigation/open" {
  interface OpenTargetMap {
    /** そのプロジェクトの右サイドバー（チャット欄）のブラウザの新しいタブ（右サイドバーを別ウィンドウへ移していれば、そのウィンドウで） */
    browser: { projectId: number; url: string };
  }
}

export const browserTarget: OpenTargetHandler<"browser"> = {
  kind: "browser",
  open({ projectId, url }) {
    openSideBrowser(projectId, url);
    return true;
  },
};
