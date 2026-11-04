import type { Chat } from "@shared/types";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";
import { closeLayoutTabs, closePane, placeTab, reconcileLayout, renameTab, singlePane, type PaneLayout } from "@/features/panel/layout/paneLayout";
import { closedLinks, NO_LINKS, openedLinks, syncLinkedTabs, type LinkState } from "./linkedTabs";

/**
 * 1 つの欄のパネルの状態（欄・画面ごとに 1 つ。panelStore.ts が覚える）: タブ・分割の配置（いつもタブにそろえておく）・開いているか・
 * サイドバーとの連動の覚え。変えるのはすべて panelReducer（純粋関数）で、閉じたタブの後始末・保存は店が行う
 */
export interface PanelState {
  tabs: readonly PanelTab[];
  layout: PaneLayout;
  open: boolean;
  links: LinkState;
}

/** 欄の決まりのうち、状態の変え方にかかわるもの（店が欄の決まり SURFACES と「表示するタブ」から作る） */
export interface PanelRules {
  /** いまこの欄で見せている種類のタブか */
  shows: (tab: PanelTab) => boolean;
  /** 見せている最後のタブを閉じたら欄も閉じる */
  closeWhenEmpty: boolean;
}

type TabKind = PanelTab["kind"];
/** 開いたあとに変えられるタブの中身（種類ごと。key・kind は変えない） */
export type TabFields<K extends TabKind> = Partial<Omit<Extract<PanelTab, { kind: K }>, "key" | "kind">>;
/** タブの中身の変え方（その種類のタブだけを変える） */
export type TabPatch = { [K in TabKind]: { kind: K; fields: TabFields<K> } }[TabKind];

export type PanelAction =
  /** タブを開く: なければピントのあるペインに足し、あればそのペインで表示する（reopen はもう開いていたときに変える中身）。欄も開く */
  | { type: "open"; tab: PanelTab; reopen?: TabPatch }
  /** 開いているタブを表示する（ないタブなら何もしない）。欄も開く */
  | { type: "show"; key: string }
  /** タブの中身を変える（変わらなければ同じ状態のまま） */
  | ({ type: "patch"; key: string } & TabPatch)
  /** タブを置き換える（送った新しいチャットを、できたチャットのタブにする。置き場所と表示中かはそのまま） */
  | { type: "replace"; key: string; tab: PanelTab }
  /** タブを閉じる（dismiss: 利用者が閉じたチャットを、連動で出し直さないよう覚える。アーカイブ・削除のあとは false） */
  | { type: "close"; keys: readonly string[]; dismiss: boolean }
  /** ペインを閉じる（サイドバーと連動したチャットは一覧のペインへ戻し、ほかのタブは閉じる。最後の 1 つは閉じない） */
  | { type: "closePane"; paneId: string }
  /** 配置を変える（分ける・移す・ピント・境目・一覧のペインへ戻す。paneLayout・paneSizes の関数を渡す） */
  | { type: "layout"; change: (layout: PaneLayout) => PaneLayout }
  /** チャットのタブを、サイドバーの一覧にそろえる（足すタブは一覧のペインへ） */
  | { type: "sync"; chats: readonly Chat[] }
  | { type: "setOpen"; open: boolean };

/** タブのない（tabs だけある）初めの状態 */
export function emptyPanel(tabs: readonly PanelTab[] = [], open = false): PanelState {
  return { tabs, layout: singlePane(tabs.map((t) => t.key), null), open, links: NO_LINKS };
}

/** サイドバーに出ているチャットのタブか（ペインを閉じても閉じず、分けたペインの × では一覧のペインへ戻すもの） */
export function isLinkedTab(state: PanelState, key: string): boolean {
  const t = state.tabs.find((x) => x.key === key);
  return t?.kind === "chat" && state.links.linked.includes(t.id);
}

/** 中身を変えたタブ（種類が違う・変わらなければ同じタブ） */
function patched(tab: PanelTab, patch: TabPatch): PanelTab {
  if (tab.kind !== patch.kind) return tab;
  const fields: Record<string, unknown> = patch.fields;
  const current = tab as unknown as Record<string, unknown>;
  return Object.keys(fields).every((k) => current[k] === fields[k]) ? tab : ({ ...tab, ...fields } as PanelTab);
}

/** タブを閉じる。見せているタブがなくなったら、欄の決まりで欄も閉じる（隠した種類のタブが残っていても） */
function closeTabs(state: PanelState, keys: readonly string[], dismiss: boolean, rules: PanelRules): PanelState {
  const closing = new Set(keys);
  const closed = state.tabs.filter((t) => closing.has(t.key));
  if (closed.length === 0) return state;
  const tabs = state.tabs.filter((t) => !closing.has(t.key));
  const chats = closed.flatMap((t) => (t.kind === "chat" ? [t.id] : []));
  const open = state.open && !(rules.closeWhenEmpty && !tabs.some(rules.shows));
  return { ...state, tabs, layout: closeLayoutTabs(state.layout, keys), links: closedLinks(state.links, chats, dismiss), open };
}

/** パネルの状態の変え方（どれも新しい状態を返す。変わらなければ同じ状態） */
export function panelReducer(state: PanelState, action: PanelAction, rules: PanelRules): PanelState {
  switch (action.type) {
    case "open": {
      const found = state.tabs.find((t) => t.key === action.tab.key);
      const tab = !found ? action.tab : action.reopen ? patched(found, action.reopen) : found;
      const tabs = !found ? [...state.tabs, tab] : tab === found ? state.tabs : state.tabs.map((t) => (t === found ? tab : t));
      const links = tab.kind === "chat" ? openedLinks(state.links, tab.id) : state.links;
      const layout = placeTab(state.layout, tab.key);
      if (tabs === state.tabs && layout === state.layout && links === state.links && state.open) return state;
      return { ...state, tabs, layout, open: true, links };
    }
    case "show": {
      if (!state.tabs.some((t) => t.key === action.key)) return state;
      const layout = placeTab(state.layout, action.key);
      return layout === state.layout && state.open ? state : { ...state, layout, open: true };
    }
    case "patch": {
      let changed = false;
      const tabs = state.tabs.map((t) => {
        if (t.key !== action.key) return t;
        const next = patched(t, action);
        changed ||= next !== t;
        return next;
      });
      return changed ? { ...state, tabs } : state;
    }
    case "replace": {
      if (!state.tabs.some((t) => t.key === action.key)) return state;
      const tabs = state.tabs.map((t) => (t.key === action.key ? action.tab : t));
      const layout = reconcileLayout(renameTab(state.layout, action.key, action.tab.key), tabs.map((t) => t.key));
      return { ...state, tabs, layout };
    }
    case "close":
      return closeTabs(state, action.keys, action.dismiss, rules);
    case "closePane": {
      const next = closePane(state.layout, action.paneId, (key) => isLinkedTab(state, key));
      if (next.layout === state.layout) return state;
      return closeTabs({ ...state, layout: next.layout }, next.closed, true, rules);
    }
    case "layout": {
      const layout = action.change(state.layout);
      return layout === state.layout ? state : { ...state, layout };
    }
    case "sync": {
      const next = syncLinkedTabs(state.tabs, action.chats, state.links);
      if (next.tabs === state.tabs) return next.links === state.links ? state : { ...state, links: next.links };
      const keys = next.tabs.map((t) => t.key);
      const kept = new Set(keys);
      const gone = state.tabs.flatMap((t) => (kept.has(t.key) ? [] : [t.key]));
      // 外れたタブは閉じたときと同じく隣のタブを表示し、足したタブは一覧のペインへ（分けたペインには自動で足さない）
      return { ...state, tabs: next.tabs, links: next.links, layout: reconcileLayout(closeLayoutTabs(state.layout, gone), keys) };
    }
    case "setOpen":
      return state.open === action.open ? state : { ...state, open: action.open };
  }
}
