import { useEffect, useRef } from "react";
import type { Chat } from "@shared/types";
import { navigate, openChat, type ReopenRoute } from "@/app/router";
import { focusedPane } from "@/features/panel/layout/paneTree";
import { useBoardFocus } from "@/features/board/useBoardFocus";
import { cx } from "@/lib/cx";
import { useSetting } from "@/hooks/useSetting";
import { CHAT_TAB_ROW_HIDDEN } from "@/lib/storageKeys";
import { useProjects } from "@/stores/projects";
import { usePanelDrafts } from "@/features/panel/state/panelDrafts";
import { panelKey } from "@/features/panel/surfaces";
import type { PanelFrame } from "@/features/panel/PanelTools";
import { terminalTargets, usePanel } from "@/features/panel/usePanel";
import { usePanelWidth } from "./usePanelWidth";

/** チャットを URL にする（サイドバーで強調され、戻る・進むで行き来できる） */
const showInUrl = (chat: Pick<Chat, "id" | "project_id">) => openChat(chat.project_id, chat.id, undefined, { replace: true });

/**
 * プロジェクトのチャットのパネル（ボードの右のパネル・ボードと分けた「チャット」タブで共通。どちらも kanban:<プロジェクト> の同じパネルなので、
 * 設定で置き方を切り替えても開いているタブ・分割はそのまま）。新しいチャットはそのプロジェクトで始め、ターミナルはその本体で開ける。
 * 新しいチャットを送ったチャットを URL にし、サイドバー・検索などから開いたチャット・新しいチャット（focus）をパネルで開く。
 * tab は新しいチャットを開いたあとに URL を戻すタブ
 */
export function useProjectChatsPanel({ projectId, holdEsc, focus, tab }: { projectId: number; holdEsc: boolean; focus?: ReopenRoute; tab: "board" | "groups" | "chats" }) {
  const { projects: all } = useProjects();
  const panel = usePanel({
    surface: "board",
    scope: projectId,
    holdEsc,
    // 新しいチャットを送ったら、そのチャットを URL にする
    onCreated: showInUrl,
    newChat: { projectId },
    terminals: terminalTargets(all, projectId),
  });
  // サイドバー・検索などから開いたチャット・新しいチャットを、パネルで開く
  useBoardFocus(
    focus,
    (target) => {
      if (target.name === "chat") panel.open({ id: target.chatId, project_id: target.projectId }, target.focus);
      else panel.openNew({ projectId: target.projectId, group: target.group });
    },
    tab,
  );
  useShownChatInUrl(panel, projectId, tab);
  return panel;
}

/**
 * タブで選んだチャットを URL にする（利用者の依頼。サイドバーの行も選択中として強調される。カードから開いたチャットと同じ）。
 * 見るのは、ピントのあるペインで表示中のタブ。変わったときだけ URL を差し替え（戻る・進むの履歴は増やさない）、チャットでないタブ
 * （新しいチャット・ブラウザ・ターミナル）にしたらプロジェクトの画面（tab）に戻して、サイドバーの強調を外す。
 * はじめて描いたときは URL を変えない（URL で開いたチャット（useBoardFocus）より先に、前に表示していたタブで上書きしないため）
 */
function useShownChatInUrl(panel: ReturnType<typeof usePanel>, projectId: number, tab: "board" | "groups" | "chats") {
  const shown = panel.panelOpen ? panel.shownTabOf(focusedPane(panel.layout)) : null;
  const shownTab = shown === null ? undefined : panel.tabs.find((t) => t.key === shown);
  // タブが覚えているチャットの ID とプロジェクト（一覧にまだ届いていないチャットでも引ける）
  const chat = shownTab?.kind === "chat" ? { id: shownTab.id, project_id: shownTab.projectId } : undefined;
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const first = prev.current === undefined;
    if (prev.current === shown) return;
    prev.current = shown;
    if (first || shown === null) return;
    if (chat) showInUrl(chat);
    else navigate({ name: "project", id: projectId, tab }, { replace: true });
    // 表示中のタブが変わったときだけ（チャットの中身が変わっても URL は変えない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
}

/**
 * プロジェクトのボード（カンバン・グループのボード）の右のパネルの殻（チャットをボードの右で開く置き方のとき）。列の分け方（状態 / グループ）を切り替えても、
 * 開閉・タブ・分割はそのまま（同じ panelKey）。全プロジェクトのボードはパネルを持たない（チャットはそのプロジェクトへ移って開く。features/board/KanbanBoard の AllProjectsKanban）。
 * 幅（左端のつまみ）・横幅いっぱい・狭いときにボードを覆うのは usePanelWidth で、frame を Panel に、body をボードとパネルを並べる要素に渡す。
 * drafts はボードに出す下書き（このボードのパネルと、同じプロジェクトのチャット欄で書いている途中のもの。いちばん左の「下書き」の列・グループに出す）。
 * カードから開いたチャットも URL にする（どちらのボードでも、チャットの URL は最後に見たボードで開く: router の boardTabOf）
 */
export function useBoardPanel({
  projectId,
  holdEsc,
  focus,
  tab = "board",
}: {
  projectId: number;
  /** true の間は Esc でパネルを閉じない（カードのメニューが開いているとき） */
  holdEsc: boolean;
  /** URL で開くチャット・新しいチャット（サイドバー・検索などから開いたとき） */
  focus?: ReopenRoute;
  /** どちらのボードか（新しいチャットを開いたあと、URL をこのボードに戻す） */
  tab?: "board" | "groups";
}) {
  const panel = useProjectChatsPanel({ projectId, holdEsc, focus, tab });
  const drafts = usePanelDrafts([panel.key, panelKey("side", projectId)]);
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
    panel.open(chat);
    showInUrl(chat);
  };
  return { panel, drafts, frame, body, open };
}
