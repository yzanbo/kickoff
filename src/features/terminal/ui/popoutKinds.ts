// terminal の別ウィンドウの種類（URL の項目・中身・戻し方。ui/contributes.ts が popoutKinds に入れる）
import { reopenInPanel, type TerminalTarget } from "@/features/panel/ui";
import type { PopoutKind } from "@/foundation/ui/navigation/popout";
import { terminalDockLabel } from "./dockLabel";
import { PopoutTerminal } from "./PopoutTerminal";
import { claimTerminal } from "./terminalOwner";

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
