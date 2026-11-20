// sidebar の別ウィンドウの種類と URL の項目の表（app/renderer/popout/contributes.ts が popoutKinds に入れる）
import type { PopoutKind } from "@/foundation/ui/navigation/popout";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /** 左のサイドバー（アプリに 1 つ。行を押すと、メインのウィンドウで開く） */
    sidebar: Record<never, never>;
  }
}

export const sidebarPopout: PopoutKind<"sidebar"> = { kind: "sidebar", fields: {} };
