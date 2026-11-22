import { useEffect, useState } from "react";
import { Panel } from "@/features/panel/ui/Panel";
import { usePanel } from "@/features/panel/ui/usePanel";
import { windowScope } from "@/features/panel/ui/surface";
import { startTabWindow, type TabWindowRoute, type TabWindowSpec } from "./tabWindow";

/**
 * タブの列のある別ウィンドウ（ブラウザ・チャット。Chrome のウィンドウと同じく、タブの列を持ち、ほかのタブを足せる。右サイドバー・チャットのパネルと同じ Panel。
 * 殻は tabWindow.ts）。移したブラウザのタブはページを URL で開き直す（webview はウィンドウをまたげない）
 */
export function PopoutTabWindow({ route, surface, first }: { route: TabWindowRoute } & TabWindowSpec) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    startTabWindow(route, { surface, first });
    setReady(true);
  }, [route, surface, first]);
  if (!ready) return <div className="popout-body page muted">読み込み中…</div>;
  return (
    <div className="popout-body popout-tab-window">
      <TabWindowPanel route={route} surface={surface} />
    </div>
  );
}

function TabWindowPanel({ route, surface }: { route: TabWindowRoute; surface: TabWindowSpec["surface"] }) {
  const panel = usePanel(surface, windowScope(route.projectId, route.key));
  return <Panel panel={panel} />;
}
