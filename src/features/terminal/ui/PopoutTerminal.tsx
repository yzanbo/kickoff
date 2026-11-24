import { lazy, Suspense } from "react";
import type { PopoutRoute } from "@/foundation/ui/navigation/popout";
import { open } from "@/foundation/ui/navigation/open";
import { terminalTitle } from "@/features/panel/ui";

const TerminalPane = lazy(() => import("./TerminalPane"));

type TerminalRoute = Extract<PopoutRoute, { kind: "terminal" }>;

/** パネルのターミナルのタブの別ウィンドウ（同じシェルにつなぎ直す。持ち主はこのウィンドウになり、閉じるとシェルも止まる） */
export function PopoutTerminal({ route }: { route: TerminalRoute }) {
  return (
    <div className="popout-body">
      <Suspense fallback={<div className="page muted">読み込み中…</div>}>
        <TerminalPane
          termKey={route.key}
          cwd={route.cwd}
          command={route.command}
          env={route.env}
          meta={{ projectId: route.projectId, title: terminalTitle(route) }}
          visible
          focused
          // ⌘ を押しながら押した URL は、そのプロジェクトの右サイドバー（チャット欄）のブラウザのタブで開く（メインのウィンドウに頼む）
          onOpenUrl={(url) => open({ kind: "browser", projectId: route.projectId, url }, { surface: "side" })}
          projectId={route.projectId}
        />
      </Suspense>
    </div>
  );
}
