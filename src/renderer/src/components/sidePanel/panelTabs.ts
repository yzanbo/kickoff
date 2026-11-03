import { Bot, Globe, MessageSquare, SquarePen, SquareTerminal, type LucideIcon } from "lucide-react";
import type { Run } from "../../../../core/types";
import { chatTitle } from "../../chatTitle";
import { normalizeUrl } from "../../url";
import type { PanelTab } from "./useSidePanel";

/**
 * タブを閉じたあとに表示するタブ。閉じたのが表示中のタブなら、同じ位置に来たタブ（最後なら 1 つ前）。
 * ほかのタブを閉じたなら表示中のまま。タブがなくなれば null
 */
export function nextActiveTab(tabs: readonly Pick<PanelTab, "key">[], closedKey: string, activeTab: string | null): string | null {
  if (activeTab !== closedKey) return activeTab;
  const index = tabs.findIndex((t) => t.key === closedKey);
  const rest = tabs.filter((t) => t.key !== closedKey);
  return rest[Math.min(index, rest.length - 1)]?.key ?? null;
}

/** ブラウザのタブに出すホスト名（URL として読めなければそのまま） */
export function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).host || url;
  } catch {
    return url;
  }
}

/**
 * タブに出す名前とアイコン。チャットかブラウザかがひと目でわかるよう、チャットは吹き出し、
 * ブラウザは地球儀、新しいチャットはペン、ターミナルは端末の印にする
 */
export function tabLabel(t: PanelTab, runs: Run[]): { Icon: LucideIcon; iconClass?: string; label: string } {
  if (t.kind === "browser") return { Icon: Globe, label: t.title || (t.url ? hostOf(t.url) : "新しいタブ") };
  if (t.kind === "terminal") return { Icon: SquareTerminal, label: `ターミナル · ${t.label}` };
  if (t.kind === "subagent") return { Icon: Bot, iconClass: "muted", label: t.title };
  if (t.kind === "new") return { Icon: SquarePen, label: t.groupName ? `新しいチャット · ${t.groupName}` : "新しいチャット" };
  // ボードの一覧にあればその最新の名前、なければタブが覚えている名前（アーカイブ済み・絞り込みで外れたチャットなど）
  const run = runs.find((r) => r.id === t.id);
  const title = run?.title ?? t.title;
  return { Icon: MessageSquare, iconClass: "muted", label: title === undefined ? "チャット" : chatTitle(title) };
}
