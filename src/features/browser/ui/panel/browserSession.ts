import { webUrlOf } from "@shared/foundation/linkTarget";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { chatPanelSettings } from "@/features/chatPanel/ui";
import { normalizeUrl } from "@/foundation/ui/lib/url";
import { reconcileLayout, singlePane, type PaneLayout, type PaneNode, type PanelTab, type SavedTabs } from "@/features/panel/ui";

type BrowserTab = Extract<PanelTab, { kind: "browser" }>;
type BrowserSession = { tabs: BrowserTab[]; layout: PaneLayout };

function fieldsOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** 読み直せるページだけ。資格情報のある URL や、再起動後に使えない URL は残さない */
function restorableUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value === "about:blank") return value;
  const url = webUrlOf(value);
  return url && !url.username && !url.password ? url.href : null;
}

function parsePane(value: unknown, ids: Set<string>, depth = 0): PaneNode | null {
  const node = fieldsOf(value);
  if (!node || depth > 32) return null;
  if (node.type === "pane") {
    const { id, tabs, active } = node;
    if (typeof id !== "string" || ids.has(id) || !Array.isArray(tabs) || !tabs.every((t) => typeof t === "string")) return null;
    ids.add(id);
    return { type: "pane", id, tabs, active: typeof active === "string" ? active : null };
  }
  const { dir, children, sizes } = node;
  if (node.type !== "split" || (dir !== "row" && dir !== "column") || !Array.isArray(children) || children.length < 2 ||
    !Array.isArray(sizes) || sizes.length !== children.length || !sizes.every((v) => typeof v === "number" && v > 0 && v <= 1)) return null;
  const parsed: PaneNode[] = [];
  for (const child of children) {
    const pane = parsePane(child, ids, depth + 1);
    if (!pane) return null;
    parsed.push(pane);
  }
  return { type: "split", dir, children: parsed, sizes };
}

/** 形の違うタブは捨て、配置だけ壊れていれば 1 つのペインに戻す */
export function readBrowserSession(projectId: number): BrowserSession | null {
  const saved = readSetting(chatPanelSettings.projectBrowserSession(projectId));
  if (!Array.isArray(saved.tabs)) return null;
  const tabs = new Map<string, BrowserTab>();
  for (const value of saved.tabs) {
    const tab = fieldsOf(value);
    if (tab?.kind !== "browser" || typeof tab.key !== "string" || !tab.key.startsWith("browser:") || typeof tab.title !== "string") continue;
    const url = restorableUrl(tab.url);
    if (url !== null && !tabs.has(tab.key)) tabs.set(tab.key, { kind: "browser", key: tab.key, url, title: url === "about:blank" ? "" : tab.title, restored: true });
  }
  if (!tabs.size) return null;
  const keys = [...tabs.keys()];
  const layout = fieldsOf(saved.layout);
  const root = parsePane(layout?.root, new Set());
  return {
    tabs: [...tabs.values()],
    layout: root && typeof layout?.focused === "string"
      ? reconcileLayout({ root, focused: layout.focused, home: typeof layout.home === "string" ? layout.home : undefined }, keys)
      : singlePane(keys, null),
  };
}

/** 個々のタブが閉じられたら除き、欄を隠しただけなら残す。初めの URL ではなく最後に表示した URL を使う */
export function writeBrowserSession(projectId: number, state: SavedTabs | null): void {
  const tabs = state?.tabs.flatMap((tab) => {
    if (tab.kind !== "browser") return [];
    const url = restorableUrl(tab.current ?? normalizeUrl(tab.url)) ?? "about:blank";
    return [{ kind: "browser", key: tab.key, url, title: url === "about:blank" ? "" : tab.title }];
  });
  writeSetting(chatPanelSettings.projectBrowserSession(projectId), state && tabs?.length ? { tabs, layout: state.layout } : {});
}
