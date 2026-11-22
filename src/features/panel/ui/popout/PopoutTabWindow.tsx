import { lazy, Suspense, useEffect, useState } from "react";
import type { PopoutRoute } from "@/foundation/ui/navigation/popout";
import { postToMainWindow, postWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { chatKey, terminalTitle } from "@/features/panel/ui/tabs/tabData";
import { Panel } from "@/features/panel/ui/Panel";
import { usePanel, type TerminalTarget } from "@/features/panel/ui/usePanel";
import { panelKey, windowScope } from "@/features/panel/ui/surface";
import { startTabWindow, type TabWindowRoute } from "./tabWindow";

const TerminalPane = lazy(() => import("@/features/terminal/ui/TerminalPane"));

type TerminalRoute = Extract<PopoutRoute, { kind: "terminal" }>;

/** タブの列のある別ウィンドウ（ブラウザ・チャット）はターミナルを開かない */
const NO_TERMINALS: TerminalTarget[] = [];

/**
 * タブの列のある別ウィンドウ（ブラウザ・チャット。Chrome のウィンドウと同じく、タブの列を持ち、ほかのタブを足せる。右サイドバー・チャットのパネルと同じ Panel。
 * 殻は tabWindow.ts）。移したブラウザのタブはページを URL で開き直す（webview はウィンドウをまたげない）
 */
export function PopoutTabWindow({ route }: { route: TabWindowRoute }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    startTabWindow(route);
    setReady(true);
  }, [route]);
  if (!ready) return <div className="popout-body page muted">読み込み中…</div>;
  return (
    <div className="popout-body popout-tab-window">
      <TabWindowPanel route={route} />
    </div>
  );
}

function TabWindowPanel({ route }: { route: TabWindowRoute }) {
  const panel = usePanel({
    surface: route.kind === "browser" ? "win" : "cwin",
    scope: windowScope(route.projectId, route.key),
    newChat: undefined,
    terminals: NO_TERMINALS,
    // このウィンドウで送ってできたチャットは、メインのウィンドウのチャットのパネルには出さない（サイドバーとの連動で足されたら、表示だけ消してもらう）
    onCreated: (chat) => postWindowMessage("tabMovedOut", { panel: panelKey("kanban", chat.project_id), key: chatKey(chat.id), kind: "chat" }),
  });
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
          onOpenUrl={(url) => postToMainWindow("panelOp", { op: "openBrowser", panel: panelKey("side", route.projectId), url })}
          projectId={route.projectId}
        />
      </Suspense>
    </div>
  );
}
