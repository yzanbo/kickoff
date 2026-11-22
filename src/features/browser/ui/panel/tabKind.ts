// ブラウザのタブの種類（右サイドバー・ブラウザの別ウィンドウ）。ui/contributes.ts が panelTabs に入れる
import type { HTMLAttributes } from "react";
import { Globe } from "lucide-react";
import { defineTabKind, hostOf, projectOfPanel, type PanelTab, type TabFaceProps } from "@/features/panel/ui";
import { BrowserTabLead } from "@/features/browser/ui/BrowserTabLead";
import { agentBrowsingClass } from "@/features/browser/ui/agentBrowsing";
import { BrowserPage } from "./BrowserTabPage";

type BrowserTab = Extract<PanelTab, { kind: "browser" }>;

/** ブラウザのページ内検索が、名前のボタンにピントがあるときに読む印（HTMLAttributes に data-* を書けないので、属性の束として渡す） */
const BrowserTabFace = ({ tab, render }: TabFaceProps<BrowserTab>) => render({ attrs: { "data-browser-tab-key": tab.key } as HTMLAttributes<HTMLDivElement> });

/** 空のページのあいだは「新しいタブ」 */
const titleOf = (t: BrowserTab) => t.title || (t.url ? hostOf(t.url) : "新しいタブ");

export const browserTabKind = defineTabKind<BrowserTab>({
  id: "browser",
  icon: Globe,
  // AI が操作している間は「AI 操作中」の印
  Lead: BrowserTabLead,
  label: titleOf,
  hint: (t) => t.url,
  projectOf: () => undefined,
  Face: BrowserTabFace,
  // 復元したタブは欄を初めて開くまで読み込まない
  deferUntilPanelOpen: (t) => t.restored === true,
  // AI が操作しているタブは、表に出ていなくても見えない形で並べる（撮る・押すため。browser.css）
  pageClass: agentBrowsingClass,
  // いまのページを別ウィンドウで開き直す（webview はウィンドウをまたげないので、戻る・進むの履歴は引き継がない）
  popout: (t, panel) => ({
    route: { kind: "browser", panel, key: t.key, url: t.current ?? t.url, title: t.title, projectId: projectOfPanel(panel) },
    title: `${titleOf(t)} — ブラウザ`,
  }),
  Page: BrowserPage,
});
