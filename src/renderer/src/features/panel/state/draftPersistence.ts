import { readSetting, writeSetting } from "@/lib/storage";
import { NEW_CHAT_DRAFTS } from "@/lib/storageKeys";
import { panelKey, parsePanelKey } from "@/features/panel/surfaces";
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

/**
 * チャットを出さない欄（全プロジェクトの画面のボードの右のパネル（いまは持たない）・右サイドバー（チャット欄。ブラウザだけ）・フッター（ターミナルだけ））に
 * 残っていた下書きを、作成先のプロジェクトのチャットのパネルへ移す（そのパネルの下書きの後ろに足す。同じタブがすでにあれば重ねない）。
 * 開けない欄に下書きが残り続けないように、読み戻すときに 1 度だけ行う。移すものがなければ同じ Map を返す
 */
export function moveDraftsToChatPanels(saved: ReadonlyMap<string, DraftTab[]>): ReadonlyMap<string, DraftTab[]> {
  const froms = [...saved.keys()].filter((key) => {
    const at = parsePanelKey(key);
    // チャットの別ウィンドウに残った下書きも、起動したときはチャットのパネルへ（別ウィンドウはアプリを閉じると閉じる）
    return at !== undefined && ((at.surface === "board" && at.scope === "all") || at.surface === "side" || at.surface === "bottom" || at.surface === "chatWindow");
  });
  if (froms.length === 0) return saved;
  const out = new Map(saved);
  for (const from of froms) {
    const stray = out.get(from) ?? [];
    out.delete(from);
    for (const tab of stray) {
      const to = panelKey("board", tab.projectId);
      const tabs = out.get(to) ?? [];
      if (!tabs.some((t) => t.key === tab.key)) out.set(to, [...tabs, tab]);
    }
  }
  return out;
}

/**
 * いまの下書き（パネルごと）を残す（打つたびに呼ばれるが、中身が変わらなければ書かない。下書きがなくなればキーごと消す）。
 * owns はこのウィンドウが持つ欄か（チャット欄を別ウィンドウへ移している間は、その欄はほかのウィンドウが書く）。持たない欄の分は、残っているものをそのまま残す
 */
export function writeDrafts(entries: Iterable<readonly [string, readonly PanelTab[]]>, owns: (panel: string) => boolean = () => true) {
  const data: Record<string, DraftTab[]> = {};
  for (const [panel, tabs] of readSavedDrafts()) if (!owns(panel)) data[panel] = tabs;
  for (const [panel, tabs] of entries) {
    if (!owns(panel)) continue;
    const drafts = tabs.filter(isDraftTab);
    if (drafts.length > 0) data[panel] = drafts;
  }
  writeSetting(NEW_CHAT_DRAFTS, data);
}
