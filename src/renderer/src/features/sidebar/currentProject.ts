import { useSetting } from "@/hooks/useSetting";
import { readSetting, writeSetting } from "@/lib/storage";
import { CURRENT_PROJECT } from "@/lib/storageKeys";

/** サイドバーで最後に選んでいたプロジェクト（⌘N の新しいチャットの作成先にも使う。まだなければ undefined） */
export function loadCurrentProject(): number | undefined {
  return readSetting(CURRENT_PROJECT) || undefined;
}

/** 同じものを React で読む（サイドバーで選び直すと描き直す。全プロジェクトの画面のチャット欄の持ち主に使う） */
export function useCurrentProject(): number | undefined {
  return useSetting(CURRENT_PROJECT)[0] || undefined;
}

export function saveCurrentProject(id: number) {
  writeSetting(CURRENT_PROJECT, id);
}
