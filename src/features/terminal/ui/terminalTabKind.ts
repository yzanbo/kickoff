// ターミナルのタブの種類（フッター）。ui/contributes.ts が panelTabs に入れる
import { SquareTerminal } from "lucide-react";
import { api } from "@/foundation/ui/api";
import { defineTabKind, terminalTitle } from "@/features/panel/ui";
import { claimTerminal } from "./terminalOwner";
import { TerminalPage, type TerminalTab } from "./terminalTabPage";

export const terminalTabKind = defineTabKind<TerminalTab>({
  id: "terminal",
  icon: SquareTerminal,
  label: terminalTitle,
  hint: (t) => (t.command ? `${t.command}\n${t.cwd}` : t.cwd),
  projectOf: (t) => t.projectId,
  // シェルを止める（コアの API。もう終わっていれば 404 なので、失敗は捨てる）
  dispose: (t) => void (globalThis.window?.kickoff?.terminal && api.closeTerminal(t.key).catch(() => {})),
  // 同じシェルに別ウィンドウからつなぎ直す（移すときはシェルを止めない。popOutTab の keep）
  popout: (t, panel) => {
    const { key, kind: _kind, ...target } = t;
    return { route: { kind: "terminal", panel, key, ...target }, title: `${terminalTitle(t)} — ターミナル` };
  },
  // 右サイドバーを受け取ったウィンドウがシェルの持ち主になる（渡した側を閉じてもシェルを止めさせない）
  onMoveToWindow: (t) => claimTerminal(t.key),
  Page: TerminalPage,
});
