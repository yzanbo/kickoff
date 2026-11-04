import { readSetting, writeSetting } from "@/lib/storage";
import { CURRENT_PROJECT } from "@/lib/storageKeys";

/** サイドバーで最後に選んでいたプロジェクト（⌘N の新しいチャットの作成先にも使う。まだなければ undefined） */
export function loadCurrentProject(): number | undefined {
  return readSetting(CURRENT_PROJECT) || undefined;
}

export function saveCurrentProject(id: number) {
  writeSetting(CURRENT_PROJECT, id);
}
