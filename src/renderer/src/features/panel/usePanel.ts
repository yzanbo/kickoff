import { useMemo } from "react";
import type { Project, Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { isTabVisible } from "@/features/panel/layout/paneLayout";
import { chatKey } from "@/features/panel/state/linkedTabs";
import { panelActions } from "@/features/panel/state/panelActions";
import { kindOfTab, usePanelKinds } from "@/features/panel/state/panelKinds";
import { isLinkedTab } from "@/features/panel/state/panelState";
import { useMountedPanel, usePanelState } from "@/features/panel/state/panelStore";
import { useLinkedTabs } from "@/features/panel/state/useLinkedChats";
import { panelKey, SURFACES, type PanelScope, type PanelSurface } from "@/features/panel/surfaces";
import { usePanelWidth } from "./usePanelWidth";

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
 * 表示は Panel（body の中の最後に置く）・PanelToggle（見出しの開閉ボタン）で行う
 */
export function usePanel({ surface, scope, holdEsc = false, projects, onCreated }: Options) {
  const key = panelKey(surface, scope);
  const state = usePanelState(key);
  const { tabs, layout, open: panelOpen } = state;
  useMountedPanel(key);
  // 欄で表示するタブの種類（隠した種類のタブは閉じずに残す。隠している種類のタブを自分で開いたら、その種類を出す）
  const kinds = usePanelKinds(surface);
  // サイドバーに出ているチャット（タブのチャットの状態・まとまりの数もこれで数える）
  const chats = useLinkedTabs(key, scope);
  const actions = useMemo(() => panelActions(key), [key]);
  // 幅と横幅いっぱい（ボードを覆う）
  const size = usePanelWidth();

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

  return {
    ...actions,
    /** 覚えておく名前（欄・画面ごと。panelKey） */
    key,
    tabs,
    surface,
    /** 表示するタブの種類（タブの列の「表示するタブ」） */
    kinds,
    /** そのタブの種類をこの欄で見せているか */
    isKindShown: (tabKey: string) => {
      const t = tabs.find((x) => x.key === tabKey);
      return t !== undefined && kinds.has(kindOfTab(t));
    },
    /** 分割の配置 */
    layout,
    panelOpen,
    /** パネルが横幅いっぱいに見えているか（横幅いっぱいにした・横に残るボードが狭すぎてボードを覆っている） */
    panelFull: size.maximized || size.covering,
    /** 元の幅に戻せるか（覆っていて、ボードを残すとパネルの最小の幅に足りないほど狭いときは戻せない） */
    canRestoreWidth: size.canRestore,
    chats,
    projects,
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
    toggleMaximized: size.toggleMaximized,
    /** パネル（aside）に付ける（左端のつまみのドラッグを始めたときの幅を測る） */
    paneRef: size.paneRef,
    resizeHandle: size.resizeHandle,
    /** ボードとパネルを並べる要素に渡す */
    body: {
      ref: size.bodyRef,
      // 覆っているときは間隔を消す（ドラッグ中は指の位置どおりの幅にするので付けない）
      className: cx("board-body", panelOpen && "with-panel", (size.maximized || size.covering) && !size.resizing && "panel-full", size.resizing && "resizing", size.stretching && "stretching"),
      style: size.style,
    },
  };
}
