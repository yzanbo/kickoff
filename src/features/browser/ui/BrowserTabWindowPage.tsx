import type { PopoutRoute } from "@/foundation/ui/navigation/popout";
import { PopoutTabWindow, type PanelTab } from "@/features/panel/ui";

type BrowserRoute = Extract<PopoutRoute, { kind: "browser" }>;

/** 移したブラウザのタブ（ページは URL で開き直す。webview はウィンドウをまたげない） */
const firstTab = (route: BrowserRoute): PanelTab => ({ kind: "browser", key: route.key, url: route.url, title: route.title });

/** ブラウザの別ウィンドウ（タブの列を持ち、ほかのブラウザのタブも足せる。欄 win） */
export function BrowserTabWindowPage({ route }: { route: BrowserRoute }) {
  return <PopoutTabWindow route={route} surface="win" first={firstTab as (route: PopoutRoute) => PanelTab} />;
}
