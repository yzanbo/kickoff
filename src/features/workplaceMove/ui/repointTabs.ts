// 作業場所を移したら、そのチャットの右の欄の作業場所付きのタブ（変更・ファイル・プロジェクトの画面・DB）を新しい作業場所に付け替える。
// 書きかけのファイルのタブだけは付け替えずに残し、そう知らせる
import type { WorkplaceRef } from "@shared/chat/chatEvent";
import { useServerEvent } from "@/foundation/ui/api/events";
import { showToast } from "@/foundation/ui/kit/toast";
import { isFileTabDirty } from "@/features/files/ui/fileTabs";
import { panelActions } from "@/features/panel/ui/state/panelActions";
import { panelStateOf } from "@/features/panel/ui/state/panelStore";
import { panelKey } from "@/features/panel/ui/surfaces";
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";
import { changesTab, databaseTab, fileTab, projectViewTab } from "@/features/panel/ui/tabs/tabKinds";

type Place = Pick<WorkplaceRef, "project_id" | "worktree_path">;

/** 付け替え方: 置き換えるタブ（元のキーと新しいタブ）と、書きかけで残したファイルのタブのパス */
export interface RepointPlan {
  replace: [string, PanelTab][];
  kept: string[];
}

/** タブの並びから、移す前の作業場所を指すタブの付け替え方を決める（純粋。isDirty はファイルのタブが書きかけか） */
export function repointPlan(tabs: readonly PanelTab[], chatId: number, from: Place, to: Place, isDirty: (tabKey: string) => boolean): RepointPlan {
  const plan: RepointPlan = { replace: [], kept: [] };
  const worktree = to.worktree_path ?? undefined;
  const at = { chatId, projectId: to.project_id, ...(worktree ? { worktree } : {}) };
  for (const t of tabs) {
    if (t.kind !== "changes" && t.kind !== "file" && t.kind !== "projectView" && t.kind !== "database") continue;
    if (t.chatId !== chatId || t.projectId !== from.project_id || (t.worktree ?? null) !== from.worktree_path) continue;
    if (t.kind === "file" && isDirty(t.key)) {
      plan.kept.push(t.path);
      continue;
    }
    const next =
      t.kind === "changes"
        ? changesTab({ ...at, ...(t.focus ? { focus: t.focus } : {}) })
        : t.kind === "file"
          ? fileTab({ ...at, path: t.path, ...(t.line ? { line: t.line } : {}) })
          : t.kind === "projectView"
            ? projectViewTab({ ...at, view: t.view })
            : databaseTab(at);
    plan.replace.push([t.key, next]);
  }
  return plan;
}

/** チャットの右の欄のタブを付け替える（区切りの記録が届いたとき） */
function repointSideTabs(chatId: number, from: Place, to: Place) {
  const key = panelKey("agents", chatId);
  const plan = repointPlan(panelStateOf(key).tabs, chatId, from, to, (tabKey) => isFileTabDirty(key, tabKey));
  const actions = panelActions(key);
  for (const [old, tab] of plan.replace) actions.replaceTab(old, tab);
  if (plan.kept.length > 0) {
    showToast(`保存していないファイルのタブ（${plan.kept.join("、")}）は、移す前の作業場所のまま残しました`);
  }
}

/** 作業場所を移した区切りの記録を受けて、そのチャットの右の欄のタブを付け替える（App が 1 回置く） */
export function useWorkplaceMoveTabs() {
  useServerEvent((e) => {
    if (e.type !== "chat_event" || e.event.type !== "workplace_moved") return;
    repointSideTabs(e.event.chat_id, e.event.data.from, e.event.data.to);
  });
}
