import { readSetting, writeSetting } from "@/lib/storage";
import { NEW_CHAT_DRAFTS } from "@/lib/storageKeys";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";

/** 送る前の新しいチャットのタブ */
export type DraftTab = Extract<PanelTab, { kind: "new" }>;

const isDraftTab = (t: unknown): t is DraftTab => {
  const x = t as Partial<DraftTab> | null;
  return !!x && x.kind === "new" && typeof x.key === "string" && typeof x.projectId === "number";
};

/**
 * 前回までに残した下書き（パネルごと）。再起動しても new チャットが消えないよう、パネルの覚え（panelStore）は
 * アプリを閉じると消えるが、下書きのタブだけは保存しておく（NEW_CHAT_DRAFTS）。形の違う値は捨てる
 */
export function readSavedDrafts(): Map<string, DraftTab[]> {
  const out = new Map<string, DraftTab[]>();
  for (const [panel, tabs] of Object.entries(readSetting(NEW_CHAT_DRAFTS))) {
    const drafts = Array.isArray(tabs) ? tabs.filter(isDraftTab) : [];
    if (drafts.length > 0) out.set(panel, drafts);
  }
  return out;
}

/** いまの下書き（パネルごと）を残す（打つたびに呼ばれるが、中身が変わらなければ書かない。下書きがなくなればキーごと消す） */
export function writeDrafts(entries: Iterable<readonly [string, readonly PanelTab[]]>) {
  const data: Record<string, DraftTab[]> = {};
  for (const [panel, tabs] of entries) {
    const drafts = tabs.filter(isDraftTab);
    if (drafts.length > 0) data[panel] = drafts;
  }
  writeSetting(NEW_CHAT_DRAFTS, data);
}
