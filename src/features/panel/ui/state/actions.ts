// 欄のパネルの操作（部品の外からも呼ぶ。欄の住所 panel を先頭に受ける）。タブの中身は作る関数（tabs/tabData.ts）で作って openTab に渡す。
// 開く操作は、自分で開くタブはピントのあるペインに足し（すでにあればそのペインで表示）、欄も開く
import { findPane, focusedPane, type PaneLayout, type SplitDir, type SplitSide } from "@/features/panel/ui/layout/paneTree";
import { focusPane as focusLayoutPane, moveTab as moveLayoutTab, returnToHome as returnLayoutToHome, splitPane as splitLayoutPane } from "@/features/panel/ui/layout/paneLayout";
import { equalizeSplit as equalizeLayoutSplit, setSplitSizes } from "@/features/panel/ui/layout/paneSizes";
import type { PanelTab } from "@/features/panel/ui/panelTypes";
import { newTabKey } from "@/features/panel/ui/tabData";
import { navigate } from "@/foundation/ui/navigation/router";
import { panelScreen } from "@/features/panel/ui/surfaces";
import type { TabPatch } from "./panelState";
import { allPanels, dispatchPanel, isPanelMounted, kindOf, panelStateOf } from "./panelStore";

const changeLayout = (panel: string, change: (layout: PaneLayout) => PaneLayout) => dispatchPanel(panel, { type: "layout", change });

/** もう開いていたときに変える中身（種類の reopen。チャットは強調する発言・変更は移るファイル・ファイルは目立たせる行。openTab の reopen に渡す） */
export const reopenOf = (tab: PanelTab): TabPatch | undefined => kindOf(tab).reopen?.(tab);

/** タブを開く（なければピントのあるペインに足し、あればそのペインで表示する。reopen はもう開いていたときに変える中身）。欄も開く */
export const openTab = (panel: string, tab: PanelTab, reopen?: TabPatch) => dispatchPanel(panel, { type: "open", tab, reopen });

/** 欄にタブを開き直す（その欄が画面になければ、その画面へ移ってから。別ウィンドウを元の欄に戻すとき） */
export function reopenInPanel(panel: string, tab: PanelTab): void {
  const screen = isPanelMounted(panel) ? undefined : panelScreen(panel);
  if (screen) navigate(screen);
  openTab(panel, tab);
}

type TabOf<K extends PanelTab["kind"]> = Extract<PanelTab, { kind: K }>;

/**
 * 一覧から開く（ノート・ファイルのタブの右の欄）: 開いていればそのタブを表示する（changed なら確かめてから中身を替える）。newTab（⌘クリック・新しく作ったとき・
 * ほかから来たとき）なら新しいタブ、ふだんはピントのあるペインで表示中の同じ種類のタブを入れ替える（confirmReplace が false ならやめる。表示中が同じ種類でなければ新しいタブ）
 */
export async function openInFocusedPane<T extends PanelTab>(
  panel: string,
  tab: T,
  { newTab, changed, confirmReplace }: { newTab: boolean; changed?: (existing: T) => boolean; confirmReplace?: (current: T) => Promise<boolean> },
): Promise<void> {
  const state = panelStateOf(panel);
  const ofKind = (t: PanelTab | undefined): t is T => t?.kind === tab.kind;
  const existing = state.tabs.find((t) => t.key === tab.key);
  if (ofKind(existing)) {
    if (changed?.(existing)) {
      if (confirmReplace && !(await confirmReplace(existing))) return;
      replaceTab(panel, existing.key, tab);
    }
    return showTab(panel, tab.key);
  }
  const active = focusedPane(state.layout).active;
  const current = state.tabs.find((t) => t.key === active);
  if (newTab || !ofKind(current)) return openTab(panel, tab);
  if (confirmReplace && !(await confirmReplace(current))) return;
  replaceTab(panel, current.key, tab);
}

/**
 * その種類のタブを、このウィンドウの欄（panels を渡せばその欄だけ）で付け替える・閉じる（名前を変えた・ゴミ箱に入れたノート・ファイル）。
 * fn が新しいタブを返せば置き換え、null なら閉じ、同じタブならそのまま
 */
export function mapTabs<K extends PanelTab["kind"]>(kind: K, fn: (tab: TabOf<K>, panel: string) => TabOf<K> | null, panels?: readonly string[]): void {
  for (const [key, state] of [...allPanels()]) {
    if (panels && !panels.includes(key)) continue;
    for (const t of state.tabs) {
      if (t.kind !== kind) continue;
      const next = fn(t as TabOf<K>, key);
      if (next === null) closeTab(key, t.key);
      else if (next !== t) replaceTab(key, t.key, next);
    }
  }
}

/** タブを表に出さずに足す（もうあれば何もしない）。見ているタブ・欄の開閉は変えない（AI が「裏で」開いたブラウザのタブ） */
export const addTabBehind = (panel: string, tab: PanelTab) => dispatchPanel(panel, { type: "add", tab });

/** 開いているタブを表示する（タブ・下書きを押したとき。ないタブなら何もしない）。欄も開く */
export const showTab = (panel: string, key: string) => dispatchPanel(panel, { type: "show", key });

/** タブの中身を変える（新しいチャットのプロジェクト・グループ、ブラウザのタイトルなど。その種類のタブだけ） */
export const patchTab = (panel: string, key: string, patch: TabPatch) => dispatchPanel(panel, { type: "patch", key, ...patch });

/** タブを別のタブに置き換える（同じペインの同じ位置のまま。送った新しいチャット・名前を変えたノートのタブなど、キーが変わるとき） */
export const replaceTab = (panel: string, key: string, tab: PanelTab) => dispatchPanel(panel, { type: "replace", key, tab });

/**
 * タブを閉じる（表示中のタブならそのペインの隣のタブへ。空になったペインは消す）。dismiss: false はアーカイブ・削除のあと
 * （サイドバーに出ている間は連動でまた出る）。ふだんは表示だけ消したことにして、連動で出し直さない。keep: 後始末をしない（別ウィンドウへ移すとき）
 */
export const closeTab = (panel: string, key: string, { dismiss = true, keep = false }: { dismiss?: boolean; keep?: boolean } = {}) =>
  dispatchPanel(panel, { type: "close", keys: [key], dismiss, keep });

/** タブを一覧のペインへ戻す（分けたペインで、サイドバーと連動したチャットのタブを閉じたとき。表示だけ消したことにはしない） */
export const returnToHome = (panel: string, key: string) => changeLayout(panel, (l) => returnLayoutToHome(l, key));

export const setPanelOpen = (panel: string, open: boolean) => dispatchPanel(panel, { type: "setOpen", open });

/** 開閉。開くときにタブがなく emptyTab があれば、そのタブを始める（フッター = 開く場所が 1 つならターミナル。欄の殻が決める） */
export function togglePanel(panel: string, { emptyTab }: { emptyTab?: PanelTab } = {}): void {
  const state = panelStateOf(panel);
  if (state.open) return setPanelOpen(panel, false);
  if (state.tabs.length === 0 && emptyTab) return openTab(panel, emptyTab);
  setPanelOpen(panel, true);
}

/** ペインにピントを移す（ペインを押した・ペインの中で操作したとき。新しく開くタブはここに入る） */
export const focusPane = (panel: string, paneId: string) => changeLayout(panel, (l) => focusLayoutPane(l, paneId));

/** ペインを分ける。tabKey があればそのタブを新しいペインへ移し、なければ空のペインを作る */
export function splitPane(panel: string, paneId: string, dir: SplitDir, side: SplitSide, tabKey?: string): void {
  // ID は配置を変える関数の外で作る（同じ操作で同じ ID になるように）
  const id = newTabKey("pane");
  changeLayout(panel, (l) => splitLayoutPane(l, paneId, dir, side, id, tabKey));
}

/**
 * ペインを右・下に分ける（分けるボタン・⌘\）。タブが 2 つ以上なら表示中のタブを新しいペインへ移し、1 つ以下なら空のペインを作る。
 * paneId がなければピントのあるペイン
 */
export function splitShownTab(panel: string, dir: SplitDir, paneId?: string): void {
  const layout = panelStateOf(panel).layout;
  const pane = (paneId === undefined ? undefined : findPane(layout, paneId)) ?? focusedPane(layout);
  splitPane(panel, pane.id, dir, "after", pane.tabs.length > 1 ? (pane.active ?? undefined) : undefined);
}

/** タブを別のペイン（同じペインなら並べ替え）の index の位置へ移す */
export const moveTab = (panel: string, key: string, paneId: string, index?: number) => changeLayout(panel, (l) => moveLayoutTab(l, key, paneId, index));

/** ペインを閉じる（サイドバーと連動したチャットは一覧のペインへ戻し、ほかのタブは閉じる。最後の 1 つは閉じない） */
export const closePane = (panel: string, paneId: string) => dispatchPanel(panel, { type: "closePane", paneId });

/** 境目をドラッグして割合を変える（path は分割の場所） */
export const resizeSplit = (panel: string, path: number[], sizes: number[]) => changeLayout(panel, (l) => setSplitSizes(l, path, sizes));

/** 境目のダブルクリックで等分に戻す */
export const equalizeSplit = (panel: string, path: number[]) => changeLayout(panel, (l) => equalizeLayoutSplit(l, path));

/** 欄の持ち主が決める形にそろえる（チャットのパネルは、サイドバーの一覧のチャット） */
export const syncPanel = (panel: string, input: unknown) => dispatchPanel(panel, { type: "sync", input });

