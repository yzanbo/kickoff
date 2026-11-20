import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "./storage";
import { useProjects } from "@/features/projects/ui/stores/projects";

/** サイドバーで最後に選んでいたプロジェクト（⌘N の新しいチャットの作成先にも使う。まだなければ undefined） */
export function loadCurrentProject(): number | undefined {
  return readSetting(storage.settings.currentProject) || undefined;
}

/**
 * URL にプロジェクトがない画面（全プロジェクト）で使うプロジェクト: サイドバーで最後に選んでいたもの（もうなければ先頭。プロジェクトがなければ undefined）。
 * ⌘N・全プロジェクトのボードの「新規」の作成先と、全プロジェクトの画面のチャット欄の持ち主（サイドバーで選び直すと描き直す）
 */
export function useFallbackProject(): number | undefined {
  const current = useSetting(storage.settings.currentProject)[0] || undefined;
  const { projects, missing } = useProjects();
  return (missing(current) ? undefined : current) ?? projects[0]?.id;
}

export function saveCurrentProject(id: number) {
  writeSetting(storage.settings.currentProject, id);
}
