// 作業場所を移したら、そのチャットの右の欄の作業場所付きのタブ（変更・ファイル・プロジェクトの画面・DB）を新しい作業場所に付け替える（種類の repoint）。
// 書きかけのファイルのタブだけは付け替えずに残し、そう知らせる
import type { WorkplaceRef } from "@shared/chat/chatEvent";
import { useServerEvent } from "@/foundation/ui/api/events";
import { showToast } from "@/foundation/ui/kit/toast";
import { kindOf, panelStateOf, replaceTab, type PanelTab, type WorkplaceMove } from "@/features/panel/ui";
import { chatSidePanel } from "@/features/chat/ui";

type Place = Pick<WorkplaceRef, "project_id" | "worktree_path">;

/** 付け替え方: 置き換えるタブ（元のキーと新しいタブ）と、書きかけで残したタブの名前 */
export interface RepointPlan {
  replace: [string, PanelTab][];
  kept: string[];
}

/** タブの並びから付け替え方を決める（純粋。repoint はタブ 1 つの付け替え = 種類の repoint） */
export function repointPlan(tabs: readonly PanelTab[], repoint: (tab: PanelTab) => PanelTab | { kept: string } | null): RepointPlan {
  const plan: RepointPlan = { replace: [], kept: [] };
  for (const t of tabs) {
    const next = repoint(t);
    if (next === null) continue;
    if ("kept" in next) plan.kept.push(next.kept);
    else plan.replace.push([t.key, next]);
  }
  return plan;
}

/** チャットの右の欄のタブを付け替える（区切りの記録が届いたとき） */
function repointSideTabs(chatId: number, from: Place, to: Place) {
  const key = chatSidePanel(chatId);
  const move: WorkplaceMove = { chatId, from: { projectId: from.project_id, worktree: from.worktree_path }, to: { projectId: to.project_id, worktree: to.worktree_path } };
  const plan = repointPlan(panelStateOf(key).tabs, (t) => kindOf(t).repoint?.(t, move, key) ?? null);
  for (const [old, tab] of plan.replace) replaceTab(key, old, tab);
  if (plan.kept.length > 0) {
    showToast(`保存していないファイルのタブ（${plan.kept.join("、")}）は、移す前の作業場所のまま残しました`);
  }
}

/** 作業場所を移した区切りの記録を受けて、そのチャットの右の欄のタブを付け替える（App が 1 回置く） */
export function useWorkplaceMoveTabs() {
  useServerEvent("chat_event", (e) => {
    if (e.event.type !== "workplace_moved") return;
    repointSideTabs(e.event.chat_id, e.event.data.from, e.event.data.to);
  });
}
