// sidebar の別ウィンドウの種類（URL の項目・中身・戻し方。ui/contributes.ts が popoutKinds に入れる）
import type { PopoutKind } from "@/foundation/ui/navigation/popout";
import { writeSetting } from "@/foundation/ui/storage";
import { panelFollow } from "@/features/chatPanel/ui";
import { SidebarPopoutPage } from "./PopoutSidebar";
import { storage } from "./storage";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /** 左のサイドバー（アプリに 1 つ。行を押すと、メインのウィンドウで開く） */
    sidebar: Record<never, never>;
  }
}

export const sidebarPopout: PopoutKind<"sidebar"> = {
  kind: "sidebar",
  fields: {},
  label: "サイドバー",
  Page: SidebarPopoutPage,
  dockLabel: () => ({ label: "左の欄に戻す", tip: "メインのウィンドウのサイドバーを開いて、このウィンドウを閉じる", left: true }),
  // メインのウィンドウのサイドバーを開く
  dock: () => writeSetting(storage.settings.open, true),
  // 下書きの行・子チャットの行の「開いている」見た目に要る、メインのウィンドウのパネルの値だけを写す
  follow: panelFollow,
};
