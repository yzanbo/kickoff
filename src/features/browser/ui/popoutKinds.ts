// browser の別ウィンドウの種類と URL の項目の表（app/renderer/popout/contributes.ts が popoutKinds に入れる）
import type { PopoutKind } from "@/foundation/ui/navigation/popout";

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
};
