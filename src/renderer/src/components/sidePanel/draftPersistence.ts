import { NEW_CHAT_DRAFTS_KEY } from "../../storageKeys";
import type { PanelTab } from "./useSidePanel";

/** 送る前の新しいチャットのタブ */
export type DraftTab = Extract<PanelTab, { kind: "new" }>;

const isDraftTab = (t: unknown): t is DraftTab => {
  const x = t as Partial<DraftTab> | null;
  return !!x && x.kind === "new" && typeof x.key === "string" && typeof x.projectId === "number";
};

/**
 * 前回までに残した下書き（パネルごと）。再起動しても new チャットが消えないよう、パネルの覚え（panelMemory）は
 * アプリを閉じると消えるが、下書きのタブだけは localStorage に残しておく。読めない値は捨てる
 */
export function readSavedDrafts(): Map<string, DraftTab[]> {
  const out = new Map<string, DraftTab[]>();
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(NEW_CHAT_DRAFTS_KEY) ?? "{}");
    if (!raw || typeof raw !== "object") return out;
    for (const [memoryKey, tabs] of Object.entries(raw)) {
      const drafts = Array.isArray(tabs) ? tabs.filter(isDraftTab) : [];
      if (drafts.length > 0) out.set(memoryKey, drafts);
    }
  } catch {
    // 壊れた値は読まない（次に書くときに置き換わる）
  }
  return out;
}

let lastWritten: string | undefined;

/** いまの下書き（パネルごと）を残す。変わっていなければ書かない（打つたびに呼ばれるため） */
export function writeDrafts(entries: Iterable<[string, PanelTab[]]>) {
  const data: Record<string, DraftTab[]> = {};
  for (const [memoryKey, tabs] of entries) {
    const drafts = tabs.filter(isDraftTab);
    if (drafts.length > 0) data[memoryKey] = drafts;
  }
  const json = JSON.stringify(data);
  if (json === lastWritten) return;
  lastWritten = json;
  if (json === "{}") localStorage.removeItem(NEW_CHAT_DRAFTS_KEY);
  else localStorage.setItem(NEW_CHAT_DRAFTS_KEY, json);
}
