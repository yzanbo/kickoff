import { useMemo } from "react";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import type { Chat } from "@shared/types";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { isTabVisible } from "@/features/panel/ui/layout/paneTree";
import { panelActions } from "@/features/panel/ui/state/panelActions";
import { isLinkedTab } from "@/features/panel/ui/state/panelState";
import { useMountedPanel, usePanelState } from "@/features/panel/ui/state/panelStore";
import { useLinkedTabs } from "@/features/chatPanel/ui/state/useLinkedChats";
import { panelKey, projectOfPanel, SURFACES, type PanelScope, type PanelSurface } from "./surfaces";
import type { NewChatTarget, PanelTab, TerminalTarget } from "@/features/panel/ui/tabs/panelTypes";
import { chatKey, tabChat } from "@/features/panel/ui/tabs/tabKinds";
import { openNoProjectsGuide } from "@/features/projects/ui/new/openNewProject";
import { isComposing } from "@/foundation/ui/lib/keys";
import { focusedPanelKey, focusInNestedPanel } from "./panelHost";

export type { NewChatTarget, PanelTab, TerminalTarget } from "@/features/panel/ui/tabs/panelTypes";
export { terminalTargets } from "@/features/panel/ui/tabs/panelTypes";

interface Options {
  /** どの欄か（決まりは SURFACES。タブのまとめ方も欄ごとに覚える） */
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
  /** 新しいチャットができたとき（URL をそのチャットにするなど） */
  onCreated?: (chat: Chat) => void;
}

export type PanelController = ReturnType<typeof usePanel>;

/**
 * タブの中身（PanelTabPage）に渡す操作。欄の状態（タブ・配置）が変わっても同じ物なので、memo したタブの中身を描き直させない
 * （ほかのタブのチャットが変わってパネルの店が変わっても、そのタブだけが描き直る）
 */
export type PanelPageOps = ReturnType<typeof panelActions> & {
  key: string;
  /** 新しいチャットを送ったら、そのタブをできたチャットのタブに置き換える（同じペインの同じ位置のまま） */
  replaceWithChat: (tabKey: string, chat: Chat) => void;
};

/**
 * 欄のパネル（チャット・新しいチャット・サブエージェント・ブラウザ・ターミナルのタブ）の状態と操作。ボードの右のパネル・右端のチャット欄・フッターで共通。
 * 状態は欄・画面ごとに店（panelStore）が覚え、変え方は純粋関数（panelState の panelReducer）。ここでは読む・そろえる・束ねるだけ。
 * タブは上下・左右のペインに分けて並べられる（配置は paneLayout の木。自分で開くタブはピントのあるペインに、
 * サイドバーと連動して自動で足すチャットのタブは一覧のペイン（homePane。分けた元のペイン）に入る）。
 * 表示は Panel。大きさ（幅・高さ・最大化）は欄の殻（useBoardPanel・useProjectChat・useBottomPanel）が持つ
 */
export function usePanel({ surface, scope, holdEsc = false, newChat, terminals, onCreated }: Options) {
  const key = panelKey(surface, scope);
  const state = usePanelState(key);
  const { tabs, layout, open: panelOpen } = state;
  useMountedPanel(key);
  // サイドバーに出ているチャット（タブのチャットの状態・まとまりの数もこれで数える。チャットを出さない欄では読まず、タブもそろえない）。
  // チャットの別ウィンドウは、そのプロジェクトのチャットを読むだけで、タブはそろえない（移したチャットだけを並べる）
  const unlinked = SURFACES[surface].unlinkedChats === true;
  const chats = useLinkedTabs(key, unlinked ? (projectOfPanel(key) ?? scope) : scope, SURFACES[surface].kinds.includes("chat"), !unlinked);
  const actions = useMemo(() => panelActions(key), [key]);
  // 新しいチャットができたときの知らせは、いま渡されているものを呼ぶ（タブの中身に渡す操作を作り直さないため）
  const created = useLatest(onCreated);
  const pageOps = useMemo<PanelPageOps>(
    () => ({
      ...actions,
      key,
      replaceWithChat: (tabKey, chat) => {
        actions.replaceWithChat(tabKey, chat);
        created.current?.(chat);
      },
    }),
    [actions, key, created],
  );

  // Esc で閉じる（Esc で閉じる欄だけ。メニューやダイアログが開いていればそちらを優先。日本語入力の変換をやめる Esc では閉じない）。
  // ピントがこの欄の中の入れ子の欄（チャットの中の右の欄）にあるときは、そちらに任せる。focused の欄は、ピントが中にあるときだけ閉じる
  const escRule = SURFACES[surface].closeOnEsc;
  useWindowEvent(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || isComposing(e) || document.querySelector("dialog[open]")) return;
      if (escRule === "focused" ? focusedPanelKey() !== key : focusInNestedPanel(key)) return;
      actions.close();
    },
    panelOpen && escRule !== false && !holdEsc,
  );

  // 欄の状態・設定が同じ間は同じ物を返す（チャットの画面が描き直っても、右の欄のパネル（memo）を描き直させない）
  return useMemo(() => {
    /** 欄でこのタブを見せているか（分割していれば、どれかのペインで表示中） */
    const isShowingTab = (tabKey: string) => panelOpen && isTabVisible(layout, tabKey);

    return {
      ...pageOps,
      /** タブの中身に渡す操作（欄の状態が変わっても同じ物） */
      pageOps,
      /** 覚えておく名前（欄・画面ごと。panelKey） */
      key,
      tabs,
      surface,
      /** 出すタブの種類（欄の決まり SURFACES の kinds） */
      kinds: new Set(SURFACES[surface].kinds),
      /** 分割の配置 */
      layout,
      panelOpen,
      chats,
      /** チャットのタブのチャット（サイドバーの一覧にあれば最新のもの、なければタブの中のチャットから届いたもの） */
      chatOf: (tab: PanelTab | undefined) => tabChat(tab, chats),
      /** 開けるターミナルの場所（Mac のアプリでなければ空） */
      terminals: window.kickoff?.terminal ? terminals : NO_TERMINALS,
      /** 「新しいチャット」（欄が決めた作成先で始める。作成先がない = 出せるプロジェクトがなければ、チャットはプロジェクトの中で始めることを案内する） */
      startNewChat: () => {
        if (newChat) actions.openNew(newChat);
        else openNoProjectsGuide();
      },
      /** サイドバーに出ているチャットのタブか（ペインを閉じても一覧のペインへ戻すもの） */
      isLinkedTab: (tabKey: string) => isLinkedTab(state, tabKey),
      isShowingTab,
      /** 欄でこのチャットを表示しているか（カードを選択中として見せる。分割していれば、どれかのペインで） */
      isShowing: (chatId: number) => isShowingTab(chatKey(chatId)),
    };
  }, [pageOps, actions, key, state, tabs, layout, panelOpen, surface, chats, terminals, newChat]);
}

const NO_TERMINALS: readonly TerminalTarget[] = [];
