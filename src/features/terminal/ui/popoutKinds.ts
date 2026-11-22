// terminal の別ウィンドウの種類（URL の項目・中身・戻し方。ui/contributes.ts が popoutKinds に入れる）
import { parsePanelKey, reopenInPanel, type TerminalTarget } from "@/features/panel/ui";
import type { PopoutDockLabel, PopoutKind } from "@/foundation/ui/navigation/popout";
import { PopoutTerminal } from "./PopoutTerminal";
import { claimTerminal } from "./terminalOwner";

/** 戻す先の欄ごとの「戻す」ボタンの名前と説明 */
function terminalDockLabel(panel: string): PopoutDockLabel {
  const surface = parsePanelKey(panel)?.surface;
  if (surface === "side") return { label: "右サイドバーに戻す", tip: "メインのウィンドウの右サイドバーで開き直して、このウィンドウを閉じる" };
  if (surface === "bottom") return { label: "下のパネルに戻す", tip: "メインのウィンドウの下のパネルで開き直して、このウィンドウを閉じる" };
  if (surface === "agents") return { label: "右の欄に戻す", tip: "メインのウィンドウの、チャットの画面の右の欄で開き直して、このウィンドウを閉じる" };
  return { label: "元の欄に戻す", tip: "メインのウィンドウの元の欄で開き直して、このウィンドウを閉じる" };
}

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /** パネルのターミナルのタブ（key は裏のシェルのキー。移した先で同じシェルにつなぎ直す） */
    terminal: { panel: string; key: string } & TerminalTarget;
  }
}

export const terminalPopout: PopoutKind<"terminal"> = {
  kind: "terminal",
  fields: { panel: "string", key: "string", projectId: { kind: "number", param: "project" }, cwd: "text", label: "text", command: "string?", title: "string?", env: "strings?" },
  label: "ターミナル",
  Page: PopoutTerminal,
  dockLabel: (route) => terminalDockLabel(route.panel),
  // 元の欄に開き直す（シェルの持ち主をメインのウィンドウにしてから。別ウィンドウが閉じてもシェルを止めさせない）
  dock: async (route) => {
    const { kind: _kind, panel, ...tab } = route;
    await claimTerminal(tab.key);
    reopenInPanel(panel, { kind: "terminal", ...tab });
  },
};
