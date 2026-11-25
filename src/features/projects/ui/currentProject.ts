import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "./storage";
import { currentProjectsIndex, useProjects } from "@/features/projects/ui/stores/projects";
import { fallbackTargetOf } from "./projectTargets";

/** サイドバーで最後に選んでいたプロジェクト（⌘N の新しいチャットの作成先にも使う。まだなければ undefined） */
export function loadCurrentProject(): number | undefined {
  return readSetting(storage.settings.currentProject) || undefined;
}

/**
 * URL にプロジェクトがない画面（全プロジェクト）で使うプロジェクト: サイドバーで最後に選んでいたもの（共通も。もうなければ利用者のプロジェクトの先頭、
 * 1 つもなければ共通。共通も使えなければ undefined。決め方は fallbackTargetOf）。
 * ⌘N・全プロジェクトのボードの「新規」の作成先と、全プロジェクトの画面のチャット欄の持ち主（サイドバーで選び直すと描き直す）
 */
export function useFallbackProject(): number | undefined {
  const current = useSetting(storage.settings.currentProject)[0] || undefined;
  return fallbackTargetOf(current, useProjects());
}

/**
 * いま見ている画面のプロジェクト（URL のプロジェクト。もうないとわかったもの・URL にないときは useFallbackProject と同じ決め方）。
 * React の外から（コマンドの ⌘⇧F）読む
 */
export function projectInView(routeProjectId: number | null): number | undefined {
  const index = currentProjectsIndex();
  if (routeProjectId !== null && !index.missing(routeProjectId)) return routeProjectId;
  return fallbackTargetOf(loadCurrentProject(), index);
}

export function saveCurrentProject(id: number) {
  writeSetting(storage.settings.currentProject, id);
}

/**
 * URL のプロジェクト（routeProjectId）。もうないとわかったもの（消した・URL の番号が違う）は、ないものとする
 * （チャット欄・下のパネル・下の帯に出さず、そのプロジェクトのワークツリー・グループなどを読みに行かない）
 */
export function useExistingProject(id: number | null): number | undefined {
  const { missing } = useProjects();
  return id === null || missing(id) ? undefined : id;
}
