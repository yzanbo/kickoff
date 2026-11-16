import { lazy, Suspense } from "react";
import { popoutPath, type PopoutRoute } from "@/app/popout";
import { postToMainWindow } from "@/app/windowBus";
import { BrowserPane } from "@/features/browser/BrowserPane";
import { panelKey } from "@/features/panel/surfaces";
import { terminalTitle } from "@/features/panel/tabs/tabKinds";

const TerminalPane = lazy(() => import("@/features/terminal/TerminalPane"));

type BrowserRoute = Extract<PopoutRoute, { kind: "browser" }>;
type TerminalRoute = Extract<PopoutRoute, { kind: "terminal" }>;

/**
 * パネルのブラウザのタブの別ウィンドウ（同じ BrowserPane。ページは URL で開き直す）。ページを移ったら URL のハッシュも移った先にし、
 * 読み込み直しても・欄に戻しても、いまのページを開く
 */
export function PopoutBrowser({ route }: { route: BrowserRoute }) {
  return (
    <div className="popout-body">
      <BrowserPane
        url={route.url}
        agentTarget={{ tabKey: route.key, projectId: route.projectId }}
        onChange={({ url, title }) => history.replaceState(null, "", `#${popoutPath({ ...route, url, title: url === "about:blank" ? "" : title })}`)}
      />
    </div>
  );
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
