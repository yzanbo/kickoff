import { useEffect, useEffectEvent, useRef } from "react";
import type { Chat } from "@shared/chat/types";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { navigate, parse, type ReopenRoute } from "@/foundation/ui/navigation/router";
import { focusedPane } from "@/features/panel/ui/layout/paneTree";
import { useBoardFocus } from "./useBoardFocus";
import { shouldFollowShownTab } from "./shownTabUrl";
import { cx } from "@/foundation/ui/lib/cx";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { CHAT_TAB_ROW_HIDDEN } from "@/foundation/ui/storage/storageKeys";
import { openNewChat, useDraftsInPanels } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { chatTab, openTab, panelKey, reopenOf } from "@/features/panel/ui";
import type { PanelFrame } from "@/features/panel/ui/PanelTools";
import { usePanel } from "@/features/panel/ui/usePanel";
import { usePanelWidth } from "./usePanelWidth";

/** チャットを URL にする（サイドバーで強調され、戻る・進むで行き来できる） */
const showInUrl = (chat: Pick<Chat, "id" | "project_id">) => openTarget({ kind: "chat", projectId: chat.project_id, chatId: chat.id });

/**
 * プロジェクトのチャットのパネル（ボードの右のパネル・ボードと分けた「チャット」タブで共通。どちらも kanban:<プロジェクト> の同じパネルなので、
 * 設定で置き方を切り替えても開いているタブ・分割はそのまま）。新しいチャットはそのプロジェクトで始め、送ったチャットを URL にする（欄の決まり。chatSurfaces.ts）。
 * サイドバー・検索などから開いたチャット・新しいチャット（focus）をパネルで開く。
 * tab は新しいチャットを開いたあとに URL を戻すタブ
 */
export function useProjectChatsPanel({ projectId, focus, tab }: { projectId: number; focus?: ReopenRoute; tab: "board" | "chats" }) {
  const panel = usePanel("kanban", projectId);
  // サイドバー・検索などから開いたチャット・新しいチャットを、パネルで開く
  useBoardFocus(
    focus,
    (target) => {
      if (target.name === "chat") {
        const tab = chatTab({ id: target.chatId, project_id: target.projectId }, target.focus);
        openTab(panel.key, tab, reopenOf(tab));
      } else openNewChat(panel.key, { projectId: target.projectId, group: target.group, worktree: target.worktree });
    },
    tab,
  );
  useShownChatInUrl(panel, projectId, tab);
  return panel;
}

/**
 * タブで選んだチャットを URL にする（サイドバーの行も選択中として強調される。カードから開いたチャットと同じ）。
 * 見るのは、ピントのあるペインで表示中のタブ。変わったときだけ画面移動として履歴に積み、チャットでないタブ
 * （新しいチャット・ブラウザ・ターミナル）にしたらプロジェクトの画面（tab）に戻して、サイドバーの強調を外す。
 * 変えるかは shouldFollowShownTab（はじめて描いたとき・ほかのプロジェクトの画面へ移る途中は変えない）
 */
function useShownChatInUrl(panel: ReturnType<typeof usePanel>, projectId: number, tab: "board" | "chats") {
  const shown = panel.panelOpen ? focusedPane(panel.layout).active : null;
  const shownTab = shown === null ? undefined : panel.tabs.find((t) => t.key === shown);
  // タブが覚えているチャットの ID とプロジェクト（一覧にまだ届いていないチャットでも引ける）
  const chat = shownTab?.kind === "chat" ? { id: shownTab.id, project_id: shownTab.projectId } : undefined;
  const prev = useRef<string | null | undefined>(undefined);
  const showShown = useEffectEvent(() => {
    const follow = shouldFollowShownTab({ prev: prev.current, shown, projectId, current: parse(location.hash) });
    prev.current = shown;
    if (!follow) return;
    if (chat) showInUrl(chat);
    else navigate({ name: "project", id: projectId, tab });
  });
  // 表示中のタブが変わったときだけ（チャットの中身が変わっても URL は変えない）
  useEffect(() => {
    showShown();
  }, [shown]);
}

/**
 * プロジェクトのボード（カンバン）の右のパネルの殻（チャットをボードの右で開く置き方のとき）。全プロジェクトのボードはパネルを持たない（チャットはそのプロジェクトへ移って開く。features/board/KanbanBoard の AllProjectsKanban）。
 * 幅（左端のつまみ）・横幅いっぱい・狭いときにボードを覆うのは usePanelWidth で、frame を Panel に、body をボードとパネルを並べる要素に渡す。
 * drafts はボードに出す下書き（このボードのパネルと、同じプロジェクトのチャット欄で書いている途中のもの。いちばん左の「下書き」の列・グループに出す）。
 * カードから開いたチャットも URL にする（router の boardTabOf）
 */
export function useBoardPanel({
  projectId,
  focus,
}: {
  projectId: number;
  /** URL で開くチャット・新しいチャット（サイドバー・検索などから開いたとき） */
  focus?: ReopenRoute;
}) {
  const panel = useProjectChatsPanel({ projectId, focus, tab: "board" });
  const drafts = useDraftsInPanels([panel.key, panelKey("side", projectId)]);
  // タブの列を隠している間は、その左の道具の「横幅いっぱい ⇔ 元の幅」も出ないので、横幅いっぱいにしない（ボードを覆ったまま戻せなくなるため）
  const [tabRowHidden] = useSetting(CHAT_TAB_ROW_HIDDEN);
  const size = usePanelWidth({ maximizable: !tabRowHidden });
  // 横幅いっぱいに見えているか（横幅いっぱいにした・横に残るボードが狭すぎてボードを覆っている）
  const full = size.maximized || size.covering;
  const frame: PanelFrame = {
    paneRef: size.paneRef,
    resizeHandle: size.resizeHandle,
    // 覆っていて、ボードを残すとパネルの最小の幅に足りないほど狭いときは、元の幅に戻せない
    maximize: { on: full, disabled: full && !size.canRestore, toggle: size.toggleMaximized },
  };
  /** ボードとパネルを並べる要素に渡す（覆っているときは間隔を消す。ドラッグ中は指の位置どおりの幅にするので付けない） */
  const body = {
    ref: size.bodyRef,
    className: cx("board-body", panel.panelOpen && "with-panel", full && !size.resizing && "panel-full", size.resizing && "resizing", size.stretching && "stretching"),
    style: size.style,
  };
  /** カードから開く（URL もそのチャットにする） */
  const open = (chat: Chat) => {
    openTab(panel.key, chatTab(chat));
    showInUrl(chat);
  };
  return { panel, drafts, frame, body, open };
}
