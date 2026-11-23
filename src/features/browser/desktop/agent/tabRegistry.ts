// AI が操作できる埋め込みブラウザのタブの登録簿（画面のブラウザのタブは、webview の準備ができたら自分を登録する。タブのキーとプロジェクト）
import { webContents, type IpcMainEvent, type WebContents } from "electron";
import type { BrowserTabInfo, RevealRequest } from "@shared/browser/control";
import { withTimeout } from "@shared/foundation/time";
import { isOurWebview } from "@/features/browser/desktop/browser";

export interface Entry {
  wc: WebContents;
  tabKey: string;
  projectId: number | null;
}

/** 登録したタブ（WebContents の ID ごと） */
const entries = new Map<number, Entry>();
/** タブのキーで登録を待っているもの（AI が開いたタブ） */
const waiters = new Map<string, (entry: Entry) => void>();

/** 閉じていないタブ */
export const liveEntries = (): Entry[] => [...entries.values()].filter((e) => !e.wc.isDestroyed());

/** 閉じていないタブ（なければ undefined） */
export function liveEntry(tabId: number): Entry | undefined {
  const entry = entries.get(tabId);
  return entry && !entry.wc.isDestroyed() ? entry : undefined;
}

/** 登録したタブのキー（閉じていても。AI が操作した印を消すため） */
export const tabKeyOf = (tabId: number): string | undefined => entries.get(tabId)?.tabKey;

/** AI が指したタブ（なければ AI に返す文のエラー） */
export function entryOf(tabId: number): Entry {
  const entry = liveEntry(tabId);
  if (!entry) throw new Error(`tab_id=${tabId} のタブはありません（閉じられた可能性があります）。browser_tabs で確かめてください。`);
  return entry;
}

/** 表に出す頼みの after（前に表に出したタブ）を、タブのキーにする（もう閉じていれば undefined = 利用者は見ていない） */
export function afterKeyOf(request: RevealRequest): string | null | undefined {
  if (request.after === null) return null;
  return liveEntry(request.after)?.tabKey;
}

export const infoOf = ({ wc, projectId }: Entry): BrowserTabInfo => ({ id: wc.id, project_id: projectId, url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading() });

/** そのキーのタブ（まだ登録されていなければ、登録されるまで ms 待つ。間に合わなければ message のエラー） */
export async function waitForTab(tabKey: string, ms: number, message: string): Promise<Entry> {
  const registered = [...entries.values()].find((e) => e.tabKey === tabKey);
  if (registered) return registered;
  return withTimeout(new Promise<Entry>((resolve) => waiters.set(tabKey, resolve)), ms, message).finally(() => waiters.delete(tabKey));
}

/** 画面のブラウザのタブ（webview）を登録する（頼んできた画面の中の webview に限る） */
export function registerTab(e: IpcMainEvent, webContentsId: number, tabKey: string, projectId: number | null) {
  const wc = webContents.fromId(webContentsId);
  if (!isOurWebview(e.sender, wc)) return;
  const known = entries.get(webContentsId);
  if (known) {
    entries.set(webContentsId, { ...known, tabKey, projectId });
    return;
  }
  const entry: Entry = { wc, tabKey, projectId };
  entries.set(webContentsId, entry);
  wc.once("destroyed", () => {
    if (entries.get(webContentsId) === entry) entries.delete(webContentsId);
  });
  waiters.get(tabKey)?.(entry);
}

/** 登録を外す（画面がタブを外した・閉じた） */
export function unregisterTab(webContentsId: number) {
  entries.delete(webContentsId);
}
