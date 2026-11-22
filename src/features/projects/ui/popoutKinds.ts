// projects の別ウィンドウの種類（URL の項目・中身・戻し方。ui/contributes.ts が popoutKinds に入れる）: 右サイドバー
import type { PopoutKind } from "@/foundation/ui/navigation/popout";
import { PopoutSideChat, returnSideWindow } from "./rightSidebar/PopoutRightSidebar";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /** 右サイドバー（アプリに 1 つ。メインのウィンドウで開いているプロジェクトの欄を出す） */
    side: Record<never, never>;
  }
}

export const sidePopout: PopoutKind<"side"> = {
  kind: "side",
  fields: {},
  label: "右サイドバー",
  Page: PopoutSideChat,
  dockLabel: () => ({ label: "右サイドバーに戻す", tip: "メインのウィンドウの右サイドバーで開き直して、このウィンドウを閉じる" }),
  // 欄の状態ごとメインのウィンドウに戻す（開いて戻す。受け取ったメインのウィンドウが docked を送る）
  returnSelf: () => returnSideWindow(true),
};
