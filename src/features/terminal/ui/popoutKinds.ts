// terminal の別ウィンドウの種類と URL の項目の表（app/renderer/popout/contributes.ts が popoutKinds に入れる）
import type { TerminalTarget } from "@/features/panel/ui";
import type { PopoutKind } from "@/foundation/ui/navigation/popout";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /** パネルのターミナルのタブ（key は裏のシェルのキー。移した先で同じシェルにつなぎ直す） */
    terminal: { panel: string; key: string } & TerminalTarget;
  }
}

export const terminalPopout: PopoutKind<"terminal"> = {
  kind: "terminal",
  fields: { panel: "string", key: "string", projectId: { kind: "number", param: "project" }, cwd: "text", label: "text", command: "string?", title: "string?", env: "strings?" },
};
