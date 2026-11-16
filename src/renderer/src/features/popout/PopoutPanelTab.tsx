import { lazy, Suspense, useEffect, useState } from "react";
import type { PopoutRoute } from "@/app/popout";
import { postToMainWindow } from "@/app/windowBus";
import { Panel } from "@/features/panel/Panel";
import { usePanel, type TerminalTarget } from "@/features/panel/usePanel";
import { panelKey, windowScope } from "@/features/panel/surfaces";
import { terminalTitle } from "@/features/panel/tabs/tabKinds";
import { startBrowserWindow } from "./browserWindow";

const TerminalPane = lazy(() => import("@/features/terminal/TerminalPane"));

type BrowserRoute = Extract<PopoutRoute, { kind: "browser" }>;
type TerminalRoute = Extract<PopoutRoute, { kind: "terminal" }>;

/** ブラウザの別ウィンドウはブラウザだけなので、ターミナルを開く場所はない */
const NO_TERMINALS: TerminalTarget[] = [];

/**
 * ブラウザの別ウィンドウ（Chrome のウィンドウと同じく、タブの列を持ち、新しいタブを足せる。右サイドバーと同じ Panel。殻は browserWindow.ts）。
 * 移したタブはページを URL で開き直す（webview はウィンドウをまたげない）
 */
export function PopoutBrowser({ route }: { route: BrowserRoute }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    startBrowserWindow(route);
    setReady(true);
  }, [route]);
  if (!ready) return <div className="popout-body page muted">読み込み中…</div>;
  return (
    <div className="popout-body popout-browser-window">
      <BrowserWindowPanel route={route} />
    </div>
  );
}

function BrowserWindowPanel({ route }: { route: BrowserRoute }) {
  const panel = usePanel({ surface: "window", scope: windowScope(route.projectId, route.key), noChat: true, newChat: undefined, terminals: NO_TERMINALS });
  return <Panel panel={panel} />;
}

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
          onOpenUrl={(url) => postToMainWindow({ type: "panelOp", op: { op: "openBrowser", panel: panelKey("side", route.projectId), url } })}
          projectId={route.projectId}
        />
      </Suspense>
    </div>
  );
}
