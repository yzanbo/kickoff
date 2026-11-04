import { CURRENT_PROJECT_KEY } from "@/lib/storageKeys";

/** サイドバーで最後に選んでいたプロジェクト（⌘N の新しいチャットの作成先にも使う） */
export function loadCurrentProject(): number | undefined {
  return Number(localStorage.getItem(CURRENT_PROJECT_KEY)) || undefined;
}

export function saveCurrentProject(id: number) {
  localStorage.setItem(CURRENT_PROJECT_KEY, String(id));
}
