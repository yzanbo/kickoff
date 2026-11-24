import { lazy, Suspense } from "react";
import { open } from "@/foundation/ui/navigation/open";
import { projectOfPanel, terminalTitle, type PanelTab, type TabPageProps } from "@/features/panel/ui";

// xterm.js は、ターミナルのタブを開いたときだけ読み込む
const TerminalPane = lazy(() => import("./TerminalPane"));

export type TerminalTab = Extract<PanelTab, { kind: "terminal" }>;

/** ターミナルのタブの中身（フッター）。⌘ を押しながら押した URL は、そのターミナルのプロジェクトの右サイドバーのブラウザで開く */
export function TerminalPage({ tab: t, panel, visible, focused }: TabPageProps<TerminalTab>) {
  return (
    <Suspense fallback={<div className="page muted">読み込み中…</div>}>
      <TerminalPane
        termKey={t.key}
        cwd={t.cwd}
        command={t.command}
        env={t.env}
        meta={{ projectId: t.projectId, title: terminalTitle(t) }}
        visible={visible}
        focused={visible && focused}
        onOpenUrl={(url) => open({ kind: "browser", projectId: t.projectId, url })}
        projectId={projectOfPanel(panel.key)}
      />
    </Suspense>
  );
}
