import type { Chat, Project } from "@shared/types";
import { openChat, type ReopenRoute } from "@/app/router";
import { useBoardFocus } from "@/features/board/useBoardFocus";
import { cx } from "@/lib/cx";
import { useProjects } from "@/stores/projects";
import { usePanelDrafts } from "@/features/panel/state/panelDrafts";
import { panelKey } from "@/features/panel/surfaces";
import type { PanelFrame } from "@/features/panel/PanelTools";
import { terminalTargets, usePanel } from "@/features/panel/usePanel";
import { usePanelWidth } from "./usePanelWidth";

/**
 * ボード（カンバン・グループのボード）の右のパネルの殻。列の分け方（状態 / グループ）を切り替えても、開閉・タブ・分割はそのまま（同じ panelKey）。
 * 新しいチャットは、プロジェクトのボードならそのプロジェクト、全プロジェクトのボードなら選べるプロジェクトの先頭（最近のプロジェクト。パネルでバッジから選び直せる）で始め、
 * ターミナルはプロジェクトのボードならその本体、全プロジェクトのボードなら各プロジェクトで開ける。
 * 幅（左端のつまみ）・横幅いっぱい・狭いときにボードを覆うのは usePanelWidth で、frame を Panel に、body をボードとパネルを並べる要素に渡す。
 * drafts はボードに出す下書き（このボードのパネルと、同じプロジェクトのチャット欄で書いている途中のもの。いちばん左の「下書き」の列・グループに出す）。
 * プロジェクトのボード（カンバン・グループのボード）では、カードから開いた・新しいチャットを送ったチャットを URL にもし（サイドバーで強調され、戻る・進むで行き来できる。
 * どちらのボードでも、チャットの URL は最後に見たボードで開く: router の boardTabOf）、サイドバー・検索などから開いたチャット・新しいチャット（focus）をパネルで開く
 */
export function useBoardPanel({
  projectId,
  holdEsc,
  projects,
  focus,
  tab = "board",
}: {
  /** 未指定なら全プロジェクトのボード */
  projectId?: number;
  /** true の間は Esc でパネルを閉じない（カードのメニューが開いているとき） */
  holdEsc: boolean;
  /** 全プロジェクトのボードでは、新しいチャットのプロジェクトを選べるようにする（選べるプロジェクト） */
  projects?: Project[];
  /** URL で開くチャット・新しいチャット（サイドバー・検索などから開いたとき。プロジェクトのボードだけ） */
  focus?: ReopenRoute;
  /** どちらのボードか（新しいチャットを開いたあと、URL をこのボードに戻す） */
  tab?: "board" | "groups";
}) {
  const { projects: all } = useProjects();
  const start = projectId ?? projects?.[0]?.id;
  /** チャットを URL にする（プロジェクトのボードだけ。全プロジェクトのボードにはチャットの URL がない） */
  const showInUrl = (chat: Pick<Chat, "id" | "project_id">) => {
    if (projectId !== undefined) openChat(chat.project_id, chat.id, undefined, { replace: true });
  };
  const panel = usePanel({
    surface: "board",
    scope: projectId ?? "all",
    holdEsc,
    projects,
    // 新しいチャットを送ったら、そのチャットを URL にする
    onCreated: showInUrl,
    newChat: start === undefined ? undefined : { projectId: start },
    terminals: terminalTargets(all, projectId),
  });
  const drafts = usePanelDrafts(projectId === undefined ? [panel.key] : [panel.key, panelKey("side", projectId)]);
  // サイドバー・検索などから開いたチャット・新しいチャットを、パネルで開く
  useBoardFocus(
    focus,
    (target) => {
      if (target.name === "chat") panel.open({ id: target.chatId, project_id: target.projectId }, target.focus);
      else panel.openNew({ projectId: target.projectId, group: target.group });
    },
    { enabled: projectId !== undefined, tab },
  );
  const size = usePanelWidth();
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
  /** カードから開く（プロジェクトのボードでは URL もそのチャットにする） */
  const open = (chat: Chat) => {
    panel.open(chat);
    showInUrl(chat);
  };
  return { panel, drafts, frame, body, open };
}
