const CURRENT_KEY = "kickoff:current-project";

/** サイドバーで最後に選んでいたプロジェクト（⌘N の新しいチャットの作成先にも使う） */
export function loadCurrentProject(): number | undefined {
  return Number(localStorage.getItem(CURRENT_KEY)) || undefined;
}

export function saveCurrentProject(id: number) {
  localStorage.setItem(CURRENT_KEY, String(id));
}
