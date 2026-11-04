import { useMemo } from "react";
import type { Project, Chat } from "@shared/types";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { isTabVisible, type PaneLeaf } from "@/features/panel/layout/paneLayout";
import { panelActions } from "@/features/panel/state/panelActions";
import { shownActiveOf, usePanelKinds } from "@/features/panel/state/panelKinds";
import { isLinkedTab } from "@/features/panel/state/panelState";
import { useMountedPanel, usePanelState } from "@/features/panel/state/panelStore";
import { useLinkedTabs } from "@/features/panel/state/useLinkedChats";
import { panelKey, SURFACES, type PanelScope, type PanelSurface } from "@/features/panel/surfaces";
import type { NewChatTarget, PanelTab, TerminalTarget } from "@/features/panel/tabs/panelTypes";
import { chatKey, kindOfTab, tabChat } from "@/features/panel/tabs/tabKinds";

export type { NewChatTarget, PanelTab, TerminalTarget } from "@/features/panel/tabs/panelTypes";
export { terminalTargets } from "@/features/panel/tabs/panelTypes";

interface Options {
  /** どの欄か（決まりは SURFACES。表示するタブの種類・タブのまとめ方も欄ごとに覚える） */
  surface: PanelSurface;
  /**
   * どの画面の欄か（プロジェクト・全プロジェクト "all"）。状態はこれで覚え、チャットのタブはこの範囲のサイドバーに出ているチャットにそろえる
   * （チャットができる・アーカイブして隠す・別のプロジェクトへ移すと、タブも増減する。アーカイブ済みはサイドバーと共通の表示の切り替えに従う）
   */
  scope: PanelScope;
  /** true の間は Esc で閉じない（メニューが開いているときなど。Esc で閉じる欄だけ） */
  holdEsc?: boolean;
  /** 「新しいチャット」で始める作成先（どのプロジェクト・グループで始めるかは欄が決める。決まらなければ始めない） */
  newChat: NewChatTarget | undefined;
  /** 開けるターミナルの場所（Mac のアプリでだけ使う。チャットを表示しているペインでは、そのチャットの作業場所で開く） */
  terminals: readonly TerminalTarget[];
  /** 全プロジェクトの画面では、新しいチャットのプロジェクトを選べるようにする */
  projects?: Project[];
  /** 新しいチャットができたとき（URL をそのチャットにするなど） */
  onCreated?: (chat: Chat) => void;
}

export type PanelController = ReturnType<typeof usePanel>;

/**
 * 欄のパネル（チャット・新しいチャット・サブエージェント・ブラウザ・ターミナルのタブ）の状態と操作。ボードの右のパネル・右端のチャット欄・フッターで共通。
 * 状態は欄・画面ごとに店（panelStore）が覚え、変え方は純粋関数（panelState の panelReducer）。ここでは読む・そろえる・束ねるだけ。
 * タブは上下・左右のペインに分けて並べられる（配置は paneLayout の木。自分で開くタブはピントのあるペインに、
 * サイドバーと連動して自動で足すチャットのタブは一覧のペイン（homePane。分けた元のペイン）に入る）。
 * 表示は Panel。大きさ（幅・高さ・最大化）は欄の殻（useBoardPanel・useProjectChat・useBottomPanel）が持つ
 */
export function usePanel({ surface, scope, holdEsc = false, newChat, terminals, projects, onCreated }: Options) {
  const key = panelKey(surface, scope);
  const state = usePanelState(key);
  const { tabs, layout, open: panelOpen } = state;
  useMountedPanel(key);
  // 欄で表示するタブの種類（隠した種類のタブは閉じずに残す。隠している種類のタブを自分で開いたら、その種類を出す）
  const kinds = usePanelKinds(surface);
  // サイドバーに出ているチャット（タブのチャットの状態・まとまりの数もこれで数える。チャットを隠している欄では読まず、タブもそろえない）
  const chats = useLinkedTabs(key, scope, kinds.has("chat"));
  const actions = useMemo(() => panelActions(key), [key]);

  // Esc で閉じる（Esc で閉じる欄だけ。メニューやダイアログが開いていればそちらを優先）
  useWindowEvent(
    "keydown",
    (e) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) actions.close();
    },
    panelOpen && SURFACES[surface].closeOnEsc && !holdEsc,
  );

  /** 欄でこのタブを見せているか（分割していれば、どれかのペインで表示中） */
  const isShowingTab = (tabKey: string) => panelOpen && isTabVisible(layout, tabKey);
  /** そのタブの種類をこの欄で見せているか */
  const isKindShown = (tabKey: string) => {
    const t = tabs.find((x) => x.key === tabKey);
    return t !== undefined && kinds.has(kindOfTab(t));
  };

  return {
    ...actions,
    /** 覚えておく名前（欄・画面ごと。panelKey） */
    key,
    tabs,
    surface,
    /** 表示するタブの種類（タブの列の「表示するタブ」） */
    kinds,
    isKindShown,
    /** ペインで見せる表示中のタブ（隠した種類のタブを表示中にしていたら、見せている種類の最初のタブ。なければ null = 空のペイン） */
    shownTabOf: (pane: PaneLeaf) => shownActiveOf(pane, isKindShown),
    /** 分割の配置 */
    layout,
    panelOpen,
    chats,
    /** チャットのタブのチャット（サイドバーの一覧にあれば最新のもの、なければタブの中のチャットから届いたもの） */
    chatOf: (tab: PanelTab | undefined) => tabChat(tab, chats),
    projects,
    /** 開けるターミナルの場所（Mac のアプリでなければ空） */
    terminals: window.kickoff?.terminal ? terminals : NO_TERMINALS,
    /** 「新しいチャット」（欄が決めた作成先で始める。決まっていなければ何もしない） */
    startNewChat: () => {
      if (newChat) actions.openNew(newChat);
    },
    /** 新しいチャットを送ったら、そのタブをできたチャットのタブに置き換える（同じペインの同じ位置のまま） */
    replaceWithChat: (tabKey: string, chat: Chat) => {
      actions.replaceWithChat(tabKey, chat);
      onCreated?.(chat);
    },
    /** サイドバーに出ているチャットのタブか（ペインを閉じても一覧のペインへ戻すもの） */
    isLinkedTab: (tabKey: string) => isLinkedTab(state, tabKey),
    isShowingTab,
    /** 欄でこのチャットを表示しているか（カードを選択中として見せる。分割していれば、どれかのペインで） */
    isShowing: (chatId: number) => isShowingTab(chatKey(chatId)),
  };
}

const NO_TERMINALS: readonly TerminalTarget[] = [];
