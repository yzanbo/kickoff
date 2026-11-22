import { useEffect, useState } from "react";
import { Panel } from "@/features/panel/ui/Panel";
import { usePanel } from "@/features/panel/ui/usePanel";
import { windowScope } from "@/features/panel/ui/surface";
import { startTabWindow, type TabWindowRoute } from "./tabWindow";

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
  const panel = usePanel(route.kind === "browser" ? "win" : "cwin", windowScope(route.projectId, route.key));
  return <Panel panel={panel} />;
}
