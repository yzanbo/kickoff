// browser の別ウィンドウの種類（URL の項目・中身・戻し方。ui/contributes.ts が popoutKinds に入れる）
import type { PopoutKind } from "@/foundation/ui/navigation/popout";
import { panelKey, PopoutTabWindow, reopenInPanel, returnTabWindow } from "@/features/panel/ui";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /**
     * パネルのブラウザのタブ（panel は移す元の欄 = 戻す先。key はタブのキー。ページは url で開き直す）。
     * projectId はどのプロジェクトの欄か（AI の操作に使う。プロジェクトの欄でなければ null）
     */
    browser: { panel: string; key: string; url: string; title: string; projectId: number | null };
  }
}

export const browserPopout: PopoutKind<"browser"> = {
  kind: "browser",
  fields: { panel: "string", key: "string", projectId: { kind: "number|null", param: "project" }, title: { kind: "text", fallback: "" }, url: "text" },
  label: "ブラウザ",
  Page: PopoutTabWindow,
  // ⌘F はページの中の検索
  find: false,
  dockLabel: () => ({ label: "右サイドバーに戻す", tip: "メインのウィンドウの右サイドバーで開き直して、このウィンドウを閉じる" }),
  // タブをすべて右サイドバーに戻す
  returnSelf: returnTabWindow,
  // ブラウザは右サイドバーだけに置く（ブラウザの別ウィンドウから、さらに移したタブも）
  dock: (route) => reopenInPanel(route.projectId !== null ? panelKey("side", route.projectId) : route.panel, { key: route.key, kind: "browser", url: route.url, title: route.title }),
};
