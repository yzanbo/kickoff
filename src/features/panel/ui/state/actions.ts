// 欄のパネルの操作（部品の外からも呼ぶ。欄の住所 panel を先頭に受ける）。タブの中身は作る関数（tabs/tabData.ts）で作って openTab に渡す。
// 開く操作は、自分で開くタブはピントのあるペインに足し（すでにあればそのペインで表示）、欄も開く
import type { PaneLayout, SplitDir, SplitSide } from "@/features/panel/ui/layout/paneTree";
import { focusPane as focusLayoutPane, moveTab as moveLayoutTab, returnToHome as returnLayoutToHome, splitPane as splitLayoutPane } from "@/features/panel/ui/layout/paneLayout";
import { equalizeSplit as equalizeLayoutSplit, setSplitSizes } from "@/features/panel/ui/layout/paneSizes";
import { parsePanelKey } from "@/features/panel/ui/surface";
import type { NewChatTarget, PanelTab, TerminalTarget } from "@/features/panel/ui/tabs/panelTypes";
import { newChatTab, newTabKey, terminalTab } from "@/features/panel/ui/tabs/tabData";
import type { TabPatch } from "./panelState";
import { dispatchPanel, panelStateOf, surfaceOf } from "./panelStore";

const changeLayout = (panel: string, change: (layout: PaneLayout) => PaneLayout) => dispatchPanel(panel, { type: "layout", change });

/** タブを開く（なければピントのあるペインに足し、あればそのペインで表示する。reopen はもう開いていたときに変える中身）。欄も開く */
export const openTab = (panel: string, tab: PanelTab, reopen?: TabPatch) => dispatchPanel(panel, { type: "open", tab, reopen });

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

/**
 * 開閉。開くときにタブがなければ、欄の決まり（openWhenEmpty）でタブを始める
 * （フッター = 開く場所 terminal が決まっていればターミナル）
 */
export function togglePanel(panel: string, { terminal }: { terminal?: TerminalTarget } = {}): void {
  const state = panelStateOf(panel);
  const at = parsePanelKey(panel);
  if (state.open || !at) return setPanelOpen(panel, !state.open);
  if (state.tabs.length === 0 && surfaceOf(at.surface)?.openWhenEmpty === "terminal" && terminal) return openTab(panel, terminalTab(terminal));
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

/** 新しいチャットのタブを最後に開いたもの（欄ごと。開発時の effect の二重実行で、同じタブを 2 つ開かないように） */
const lastNew = new Map<string, { target: string; key: string; at: number }>();

/**
 * 新しいチャットのタブを開き、そのキーを返す（ボードや列・グループの＋、サイドバーの＋など）。押すたびに新しいタブを開く
 * （書きかけの新しいチャットがあっても、もう 1 つ始められる）。seed は初めに入力欄に入れるもの（送信待ちの指示から始めたとき）
 */
export function openNewChat(panel: string, target: NewChatTarget, seed?: Extract<PanelTab, { kind: "new" }>["seed"]): string {
  // 同じ指定でほぼ同時に呼ばれたとき（開発時の effect の二重実行）だけ 1 つにまとめる（初めの入力があるものは利用者の操作なのでまとめない）
  const sig = `${target.projectId}:${target.group ?? ""}:${target.worktree ?? ""}`;
  const recent = lastNew.get(panel);
  const key = !seed && recent && recent.target === sig && Date.now() - recent.at < 100 ? recent.key : newTabKey("new");
  lastNew.set(panel, { target: sig, key, at: Date.now() });
  openTab(panel, newChatTab(target, seed, key));
  return key;
}
