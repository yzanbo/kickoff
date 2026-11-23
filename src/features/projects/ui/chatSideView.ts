// チャットの右の欄のプロジェクトの画面のタブ（種類 projectView 1 つ）: 画面の表（projectViews）の chatSide に置ける画面を、名前・アイコン・説明ごと表から引く
import { FileText } from "lucide-react";
import { baseName } from "@/foundation/ui/lib/format";
import { defineTabKind, repointedAt, type PanelTab } from "@/features/panel/ui";
import { projectViewOf } from "./projectViews";
import { ChatSideViewLead, ChatSideViewPage } from "./chatSideViewPage";
import { confirmLeaveView, projectViewSurface } from "./viewLeave";

type ProjectViewTab = Extract<PanelTab, { kind: "projectView" }>;

/** タブの作業場所の呼び名（説明・別ウィンドウの名前） */
const whereOf = (worktree: string | undefined) => (worktree ? `ワークツリー ${baseName(worktree)}` : "本体");

/** 右の欄に開くプロジェクトの画面のタブ（画面ごとに、その欄に 1 つのタブ） */
export const projectViewTab = ({ chatId, projectId, worktree, view }: Omit<ProjectViewTab, "key" | "kind">): ProjectViewTab => ({
  key: `project-view:${view}`,
  kind: "projectView",
  chatId,
  projectId,
  view,
  ...(worktree ? { worktree } : {}),
});

export const projectViewTabKind = defineTabKind<ProjectViewTab>({
  id: "projectView",
  // アイコンは画面の表のもの（Lead）
  icon: FileText,
  Lead: ChatSideViewLead,
  label: (t) => projectViewOf(t.view)?.label ?? t.view,
  hint: (t) => {
    const def = projectViewOf(t.view);
    const where = whereOf(t.worktree);
    return def?.chatSide?.hint?.(where) ?? `プロジェクトの「${def?.label ?? t.view}」（${where}から）`;
  },
  projectOf: (t) => t.projectId,
  // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
  ownerChatId: (t) => t.chatId,
  popout: (t) => {
    const popout = projectViewOf(t.view)?.chatSide?.popout;
    return popout?.({ chatId: t.chatId, projectId: t.projectId, ...(t.worktree ? { worktree: t.worktree } : {}) }, whereOf(t.worktree));
  },
  // 中の書きかけ（DB の表の変更など）があれば、閉じる前に保存するかを聞く
  confirmClose: (t) => confirmLeaveView(projectViewSurface({ place: "chatSide", projectId: t.projectId, chatId: t.chatId, view: t.view }), "タブを閉じます。"),
  // 作業場所に付く画面は、作業場所を移したら新しい作業場所から見る
  repoint: (t, move) => {
    if (!projectViewOf(t.view)?.followsWorkplace) return null;
    const at = repointedAt(t, move);
    return at && projectViewTab({ ...at, view: t.view });
  },
  Page: ChatSideViewPage,
});
